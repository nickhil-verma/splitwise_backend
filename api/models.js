import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true },
    upi_id: { type: String, required: true },
    password: { type: String, required: true },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    friendRequests: [
      {
        from: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        date: { type: Date, default: Date.now }
      }
    ],
  },
  { timestamps: true }
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    expenses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Expense" }],
  },
  { timestamps: true }
);

const expenseSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
    splits: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        shareAmount: Number,
        paid: { type: Boolean, default: false },
      },
    ],
    paid: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
export const Group = mongoose.model("Group", groupSchema);
export const Expense = mongoose.model("Expense", expenseSchema);
