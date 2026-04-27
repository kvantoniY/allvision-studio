import multer from 'multer';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB

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

function trendAssetFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (file.fieldname === 'previewVideo') {
    videoFileFilter(_req, file, cb);
    return;
  }
  if (file.fieldname === 'thumbnail') {
    imageFileFilter(_req, file, cb);
    return;
  }
  cb(new Error(`INVALID_MIME: ${file.mimetype}`));
}

const baseMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: imageFileFilter,
});

const videoMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: videoFileFilter,
});

const trendAssetsMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: trendAssetFileFilter,
});

export const uploadSinglePhoto = baseMulter.single('image');
export const uploadMultiplePhotos = baseMulter.array('images', 5);
export const uploadSingleVideo = videoMulter.single('video');
export const uploadTrendAssets = trendAssetsMulter.fields([
  { name: 'previewVideo', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);
