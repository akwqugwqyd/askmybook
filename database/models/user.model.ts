import mongoose, { Schema, Document, Model } from "mongoose"

export interface IUser extends Document {
  userId: string
  email?: string
  requestCount: number
  lastRequestReset: Date
  createdAt: Date
  updatedAt: Date
}

const UserSchema: Schema<IUser> = new Schema(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      unique: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
    },
    requestCount: {
      type: Number,
      default: 0,
    },
    lastRequestReset: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
)

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema)

export default User
