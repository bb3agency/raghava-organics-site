import { z } from "zod";

export const emailSchema = z.string().email("Enter a valid email address");

export const phoneSchema = z
  .string()
  .min(10, "Enter a valid phone number")
  .max(15, "Enter a valid phone number");

export const otpSchema = z
  .string()
  .length(6, "OTP must be 6 digits")
  .regex(/^\d{6}$/, "OTP must be numeric");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be less than 128 characters");

export const sendOtpInputSchema = z.object({
  phone: phoneSchema,
  turnstileToken: z.string().max(4096).optional(),
});

export const verifyOtpInputSchema = z.object({
  phone: phoneSchema,
  otp: otpSchema,
});

export const signupPhoneInputSchema = z.object({
  phone: phoneSchema,
  otp: otpSchema,
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  email: emailSchema.optional(),
});

export const emailLoginInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  turnstileToken: z.string().max(4096).optional(),
});

export const adminLoginInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  mfaCode: z
    .string()
    .min(6, "Authenticator code must be 6 digits")
    .max(8)
    .regex(/^\d{6,8}$/, "Authenticator code must be numeric")
    .optional(),
  turnstileToken: z.string().max(4096).optional(),
});

export const adminMfaCodeSchema = z
  .string()
  .min(6, "Authenticator code must be 6 digits")
  .max(8)
  .regex(/^\d{6,8}$/, "Authenticator code must be numeric");

export const forgotPasswordInputSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().max(4096).optional(),
});

export const addCartItemInputSchema = z.object({
  variantId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(1000),
});

export const updateCartItemInputSchema = z.object({
  quantity: z.number().int().min(1).max(1000),
});
