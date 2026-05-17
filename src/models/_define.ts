import mongoose, { type Model, type Schema } from "mongoose";

export function defineModel<T>(name: string, schema: Schema<T>): Model<T> {
  if (process.env.NODE_ENV !== "production") {
    delete (mongoose.models as Record<string, unknown>)[name];
    delete (mongoose.connection.models as Record<string, unknown>)[name];
  }
  return (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);
}
