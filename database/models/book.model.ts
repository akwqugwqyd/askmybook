import mongoose, { Schema, Document, Model } from "mongoose";

export type ProcessingStatus = "queued" | "processing" | "ready" | "failed";

export interface BookProcessingError {
    message: string;
    code?: string;
    occurredAt: Date;
}

export interface IBook extends Document {
    title: string;
    author: string;
    coverImage?: string;
    pdfUrl: string;
    storagePublicId?: string;
    userId: string;
    documentName: string;
    fileSize: number;
    pageCount: number;
    chunkCount: number;
    processingStatus: ProcessingStatus;
    processingStage?: string;
    processingError?: BookProcessingError;
    processedAt?: Date;
    processingStartedAt?: Date;
    processingAttempts: number;
    indexingVersion: number;
    embeddingModel?: string;
    embeddingVersion: number;
    extractionMethod?: "text" | "ocr";
    checksum?: string;
    metadata?: {
        pdfTitle?: string;
        pdfAuthor?: string;
        creator?: string;
        producer?: string;
        creationDate?: string;
    };
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
            index: true,
        },
        storagePublicId: {
            type: String,
        },
        documentName: {
            type: String,
            required: [true, "Document name is required"],
            trim: true,
            default: "Uploaded book",
        },
        fileSize: {
            type: Number,
            default: 0,
        },
        pageCount: {
            type: Number,
            default: 0,
        },
        chunkCount: {
            type: Number,
            default: 0,
        },
        processingStatus: {
            type: String,
            enum: ["queued", "processing", "ready", "failed"],
            default: "queued",
            index: true,
        },
        processingStage: {
            type: String,
            enum: ["queued", "download", "extract", "ocr", "chunk", "embed", "vector", "persist", "complete"],
            default: "queued",
        },
        processingError: {
            message: { type: String },
            code: { type: String },
            occurredAt: { type: Date },
        },
        processedAt: {
            type: Date,
        },
        processingStartedAt: {
            type: Date,
        },
        processingAttempts: {
            type: Number,
            default: 0,
        },
        indexingVersion: {
            type: Number,
            default: 1,
        },
        embeddingModel: { type: String },
        embeddingVersion: { type: Number, default: 1 },
        extractionMethod: { type: String, enum: ["text", "ocr"] },
        checksum: { type: String, index: true },
        metadata: {
            pdfTitle: { type: String },
            pdfAuthor: { type: String },
            creator: { type: String },
            producer: { type: String },
            creationDate: { type: String },
        },
    },
    {
        timestamps: true, // auto adds createdAt and updatedAt
    }
);

BookSchema.index({ userId: 1, createdAt: -1 });
BookSchema.index({ userId: 1, processingStatus: 1 });

const Book: Model<IBook> =
    mongoose.models.Book || mongoose.model<IBook>("Book", BookSchema);

export default Book;

