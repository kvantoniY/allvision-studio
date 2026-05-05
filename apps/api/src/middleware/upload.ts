import multer from 'multer';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

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

function videoFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_VIDEO_MIME.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error(`INVALID_MIME: ${file.mimetype}`));
}

const imageMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: imageFileFilter,
});

const videoMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: videoFileFilter,
});

export const uploadSinglePhoto = imageMulter.single('image');
export const uploadMultiplePhotos = imageMulter.array('images', 10);
export const uploadSingleVideo = videoMulter.single('video');
