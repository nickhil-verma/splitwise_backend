import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cors from "cors";
import { User, Group, Expense } from "./models.js";

import 'dotenv/config';

const app = express();
app.use(express.json());
app.use(cors());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully");
    app.listen(8080, () => console.log("🚀 Server running on port 8080"));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
  });

// JWT middleware
const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// ---------- USER AUTH ----------

// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { name, phone, upi_id, password } = req.body;
    if (!name || !phone || !upi_id || !password)
      return res.status(400).json({ error: "All fields required" });

    const existing = await User.findOne({ $or: [{ name }, { phone }] });
    if (existing) return res.status(400).json({ error: "User exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, phone, upi_id, password: hashed });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.json({ token, user });
  } catch (err) {
    console.error("Signup Error:", err); // <--- log the error
    res.status(500).json({ error: "Signup failed", details: err.message });
  }
});


// Login (by name or phone)
app.post("/api/login", async (req, res) => {
  const { identifier, password } = req.body; // identifier = name or phone
  const user = await User.findOne({
    $or: [{ name: identifier }, { phone: identifier }],
  });
  if (!user) return res.status(400).json({ error: "User not found" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: "Wrong password" });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token, user });
});

// ---------- FRIEND INVITES ----------

// Send friend invite
app.post("/api/friend/invite", auth, async (req, res) => {
  const { friendIdentifier } = req.body; // name or phone
  const friend = await User.findOne({
    $or: [{ name: friendIdentifier }, { phone: friendIdentifier }],
  });
  if (!friend) return res.status(404).json({ error: "Friend not found" });

  if (friend._id.equals(req.user._id))
    return res.status(400).json({ error: "Cannot add yourself" });

  if (req.user.friends.includes(friend._id))
    return res.status(400).json({ error: "Already friends" });

  if (friend.friendRequests.includes(req.user._id))
    return res.status(400).json({ error: "Already invited" });

  friend.friendRequests.push(req.user._id);
  await friend.save();
  res.json({ message: "Friend invite sent" });
});

// ✅ NEW: View pending friend invites
app.get("/api/friend/requests", auth, async (req, res) => {
  const requests = await User.find({
    _id: { $in: req.user.friendRequests },
  }).select("name phone");
  res.json({ pendingInvites: requests });
});

// ✅ NEW: Accept friend invite
app.post("/api/friend/accept", auth, async (req, res) => {
  const { friendId } = req.body;
  const friend = await User.findById(friendId);
  if (!friend) return res.status(404).json({ error: "User not found" });

  if (!req.user.friendRequests.includes(friend._id))
    return res.status(400).json({ error: "No such pending invite" });

  // Add each other to friends list
  req.user.friends.push(friend._id);
  friend.friends.push(req.user._id);

  // Remove the invite from pending list
  req.user.friendRequests = req.user.friendRequests.filter(
    (id) => !id.equals(friend._id)
  );

  await req.user.save();
  await friend.save();
  res.json({ message: "Friend added successfully" });
});

// ✅ NEW: Reject friend invite
app.post("/api/friend/reject", auth, async (req, res) => {
  const { friendId } = req.body;
  if (!req.user.friendRequests.includes(friendId))
    return res.status(400).json({ error: "No such pending invite" });

  req.user.friendRequests = req.user.friendRequests.filter(
    (id) => id.toString() !== friendId
  );
  await req.user.save();

  res.json({ message: "Friend request rejected" });
});


// ---------- GROUPS & EXPENSES ----------

// Create group with selected friends
app.post("/api/group/create", auth, async (req, res) => {
  const { name, members } = req.body; // members = array of friend IDs
  const group = await Group.create({
    name,
    createdBy: req.user._id,
    members: [req.user._id, ...members],
  });
  res.json(group);
});

// Add expense in a group
app.post("/api/group/:groupId/expense", auth, async (req, res) => {
  const { label, amount, date, splits } = req.body;
  // splits = [{ userId, shareAmount }]
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const expense = await Expense.create({
    label,
    amount,
    date: date || new Date(),
    group: group._id,
    splits,
    paid: false,
  });

  group.expenses.push(expense._id);
  await group.save();
  res.json(expense);
});

// Mark expense as paid
app.post("/api/expense/:id/markPaid", auth, async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) return res.status(404).json({ error: "Expense not found" });
  expense.paid = true;
  await expense.save();
  res.json({ message: "Expense marked as paid" });
});

// Fetch all user groups and expenses
app.get("/api/dashboard", auth, async (req, res) => {
  const groups = await Group.find({ members: req.user._id })
    .populate("members", "name phone")
    .populate("expenses");
  res.json({ user: req.user, groups });
});

app.get("/", async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? "✅ MongoDB connected" : "❌ MongoDB not connected";
  const envStatus = process.env.MONGO_URI && process.env.JWT_SECRET ? "✅ Env variables loaded" : "❌ Env variables missing";

  res.json({
    message: "🎉 Welcome to the serverless function of Splitwise! This is a secured backend.",
    mongoStatus,
    envStatus
  });
});

export default app;
