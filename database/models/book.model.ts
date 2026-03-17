import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBook extends Document {
    title: string;
    author: string;
    coverImage?: string;
    pdfUrl: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
}

const BookSchema: Schema<IBook> = new Schema(
    {
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
        },
        author: {
            type: String,
            required: [true, "Author is required"],
            trim: true,
        },
        coverImage: {
            type: String,
            default: null,
        },
        pdfUrl: {
            type: String,
            required: [true, "PDF URL is required"],
        },
        userId: {
            type: String,
            required: [true, "User ID is required"],
        },
    },
    {
        timestamps: true, // auto adds createdAt and updatedAt
    }
);

const Book: Model<IBook> =
    mongoose.models.Book || mongoose.model<IBook>("Book", BookSchema);

export default Book;

