const { z } = require('zod');
const { ALL_STATES } = require('./services/stateMachine');

const SEVERITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lưu ý: zod mặc định BỎ QUA field lạ.
// Vì vậy có gửi kèm "role": "ADMIN" lên /auth/register cũng vô tác dụng —
// register luôn tạo HACKER.
const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,30}$/, 'username must be 3-30 characters: a-z, 0-9, _'),
  email: z.string().trim().toLowerCase().regex(EMAIL_RE, 'invalid email'),
  password: z
    .string()
    .min(8, 'password must be at least 8 characters')
    .regex(/[a-z]/, 'password must contain a lowercase letter')
    .regex(/[A-Z]/, 'password must contain an uppercase letter')
    .regex(/[0-9]/, 'password must contain a digit'),
});

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(1).optional(),
    username: z.string().trim().toLowerCase().min(1).optional(),
    identifier: z.string().trim().toLowerCase().min(1).optional(),
    password: z.string().min(1, 'password is required'),
  })
  .refine((d) => d.email || d.username || d.identifier, { message: 'email or username is required' });

const createReportSchema = z.object({
  target: z.string().trim().min(3, 'target must be at least 3 characters').max(200),
  weakness: z.string().trim().min(2, 'weakness must be at least 2 characters').max(100),
  cveId: z.string().trim().max(30).optional().nullable(),
  shortDescription: z.string().trim().min(10, 'shortDescription must be at least 10 characters').max(500),
  details: z.string().trim().min(20, 'details must be at least 20 characters').max(100000),
});

const actionSchema = z
  .object({
    comment: z.string().trim().min(1).max(50000).optional(),
    newState: z.enum(ALL_STATES).optional(),
    severity: z.enum(SEVERITIES).optional(),
    bountyAmount: z
      .number()
      .int('bountyAmount must be an integer')
      .positive('bountyAmount must be positive')
      .max(1000000)
      .optional(),
  })
  .refine((d) => d.comment || d.newState || d.severity || d.bountyAmount, {
    message: 'nothing to do: provide at least one of comment / newState / severity / bountyAmount',
  });

// Profile editor: avatar (data URL đã resize ở client) + bio ngắn.
// Gửi null (hoặc chuỗi rỗng) để xoá. Không nhận field nào khác.
const AVATAR_DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const updateProfileSchema = z.object({
  avatar: z
    .string()
    .trim()
    .max(400000, 'avatar is too large (resize before uploading)')
    .regex(AVATAR_DATA_URL_RE, 'avatar must be a data URL: data:image/(png|jpeg|webp);base64,...')
    .nullable()
    .optional(),
  bio: z.string().trim().max(160, 'bio must be at most 160 characters').nullable().optional(),
});

module.exports = { registerSchema, loginSchema, createReportSchema, actionSchema, updateProfileSchema, SEVERITIES };
