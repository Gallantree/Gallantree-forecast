import { z } from "zod";
import { Types } from "mongoose";

export const objectIdSchema = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

export const decimalStringSchema = z
  .string()
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), { message: "Invalid decimal" });

export const periodKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must be YYYY-MM");
