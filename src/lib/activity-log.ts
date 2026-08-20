import { db } from "@/lib/db";

export async function logAdminActivity(params: {
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: string;
}) {
  await db.adminActivityLog.create({
    data: {
      adminId: params.adminId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      details: params.details,
    },
  });
}
