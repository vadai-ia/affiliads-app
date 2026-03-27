import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { data } from "react-router";
import { z } from "zod";
import { requireUser } from "~/lib/auth.server";
import { actionError, actionSuccess } from "~/lib/errors";
import type { Route } from "./+types/api.upload";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const VIDEO_TYPES = new Set(["video/mp4"]);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;

function sanitizeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

export async function action({ request }: Route.ActionArgs) {
  const { supabase, user, headers } = await requireUser(request);
  const formData = await request.formData();
  const fileValue = formData.get("file");

  if (!(fileValue instanceof File)) {
    return data(actionError("Selecciona un archivo válido."), { headers });
  }

  const file = fileValue;
  if (IMAGE_TYPES.has(file.type)) {
    if (file.size > MAX_IMAGE_SIZE) {
      return data(actionError("La imagen excede 10MB."), { headers });
    }
    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(imageBuffer).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width < 1080 ||
      metadata.height < 1080
    ) {
      return data(
        actionError("La imagen debe medir al menos 1080x1080."),
        { headers },
      );
    }
  } else if (VIDEO_TYPES.has(file.type)) {
    if (file.size > MAX_VIDEO_SIZE) {
      return data(actionError("El video excede 500MB."), { headers });
    }
  } else {
    return data(
      actionError("Formato no permitido. Usa JPG, PNG o MP4."),
      { headers },
    );
  }

  const safeName = sanitizeFileName(file.name || "asset");
  const storagePath = `${user.orgId}/${randomUUID()}-${safeName}`;
  const bucket = "campaign-assets";
  const fileType = IMAGE_TYPES.has(file.type) ? "image" : "video";

  const uploadResult = await supabase.storage.from(bucket).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadResult.error) {
    return data(actionError(uploadResult.error.message), { headers });
  }

  const publicUrlResult = supabase.storage.from(bucket).getPublicUrl(storagePath);
  const payload = z
    .object({
      fileUrl: z.string().url(),
      storagePath: z.string(),
      fileType: z.enum(["image", "video"]),
      originalName: z.string().nullable(),
    })
    .parse({
      fileUrl: publicUrlResult.data.publicUrl,
      storagePath,
      fileType,
      originalName: file.name || null,
    });

  return data(actionSuccess(payload, "Asset subido correctamente."), { headers });
}
