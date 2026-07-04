import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI as string;
type MongooseCache = {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & {
    mongoose?: MongooseCache;
};

if (!MONGODB_URI) {
    throw new Error("Please define the MONGODB_URI environment variable in .env.local");
}

let cached = globalWithMongoose.mongoose;

if (!cached) {
    cached = globalWithMongoose.mongoose = { conn: null, promise: null };
}

const dbConnect = async (): Promise<typeof mongoose> => {
    if (cached.conn) return cached.conn;

    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
            serverSelectionTimeoutMS: 10_000,
        });
    }

    try {
        cached.conn = await cached.promise;
        return cached.conn;
    } catch (error) {
        // A transient DNS/network failure must not poison every later request
        // with the same rejected promise. Let the next request reconnect.
        cached.promise = null;
        cached.conn = null;
        throw error;
    }
};

export default dbConnect;




