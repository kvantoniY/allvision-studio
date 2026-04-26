import multer from 'multer';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

function imageFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_IMAGE_MIME.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error(`INVALID_MIME: ${file.mimetype}`));
}

const baseMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: imageFileFilter,
});

export const uploadSinglePhoto = baseMulter.single('image');
export const uploadMultiplePhotos = baseMulter.array('images', 5);
