import multer from 'multer';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const ALLOWED_AUDIO_MIME = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg']);
const ALLOWED_SUPPORT_FILE_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const ALLOWED_CHAT_VIDEO_MIME = new Set(['video/mp4', 'video/quicktime']);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_SERVICE_LAUNCH_SIZE = 100 * 1024 * 1024; // 100 MB (user video uploads); per-field maxSizeMb enforces tighter limits
const MAX_V3_REFERENCE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_CHAT_INPUT_SIZE = 25 * 1024 * 1024; // 25 MB

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
  if (file.fieldname === 'thumbnail' || file.fieldname === 'previewImage') {
    imageFileFilter(_req, file, cb);
    return;
  }
  cb(new Error(`INVALID_MIME: ${file.mimetype}`));
}

function serviceAssetFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (file.fieldname === 'previewVideo') {
    videoFileFilter(_req, file, cb);
    return;
  }
  if (file.fieldname === 'previewImage') {
    imageFileFilter(_req, file, cb);
    return;
  }
  cb(new Error(`INVALID_MIME: ${file.mimetype}`));
}

function mediaAssetFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_IMAGE_MIME.has(file.mimetype) || ALLOWED_VIDEO_MIME.has(file.mimetype) || ALLOWED_AUDIO_MIME.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error(`INVALID_MIME: ${file.mimetype}`));
}

function chatInputFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_IMAGE_MIME.has(file.mimetype) || ALLOWED_CHAT_VIDEO_MIME.has(file.mimetype) || ALLOWED_AUDIO_MIME.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error(`INVALID_MIME: ${file.mimetype}`));
}

function supportAttachmentFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_IMAGE_MIME.has(file.mimetype) || ALLOWED_SUPPORT_FILE_MIME.has(file.mimetype)) {
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

function serviceLaunchFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_IMAGE_MIME.has(file.mimetype) || ALLOWED_AUDIO_MIME.has(file.mimetype) || ALLOWED_VIDEO_MIME.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error(`INVALID_MIME: ${file.mimetype}`));
}

const serviceLaunchMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SERVICE_LAUNCH_SIZE },
  fileFilter: serviceLaunchFileFilter,
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

const v3ReferenceMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_V3_REFERENCE_SIZE },
  fileFilter: imageFileFilter,
});

const templateAssetsMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: trendAssetFileFilter,
});

const serviceAssetsMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: serviceAssetFileFilter,
});

const mediaAssetMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: mediaAssetFileFilter,
});

const chatInputMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CHAT_INPUT_SIZE },
  fileFilter: chatInputFileFilter,
});

// Материалы редактора: сюда несут и фотографии, и куски видео с телефона,
// поэтому лимит заметно выше чатового.
const MAX_EDITOR_MEDIA_SIZE = 200 * 1024 * 1024;

const editorMediaMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EDITOR_MEDIA_SIZE },
  fileFilter: chatInputFileFilter,
});

const supportAttachmentMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: supportAttachmentFileFilter,
});

export const uploadSinglePhoto = baseMulter.single('image');
export const uploadProfileAvatar = baseMulter.single('file');
export const uploadMultiplePhotos = baseMulter.array('images', 5);
export const uploadSingleVideo = videoMulter.single('video');
export const uploadTrendAssets = trendAssetsMulter.fields([
  { name: 'previewVideo', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);
export const uploadCharacterReferences = v3ReferenceMulter.array('images', 5);
export const uploadSceneReferences = v3ReferenceMulter.array('images', 3);
export const uploadTemplateAssets = templateAssetsMulter.fields([
  { name: 'previewVideo', maxCount: 1 },
  { name: 'previewImage', maxCount: 1 },
]);
export const uploadServiceAssets = serviceAssetsMulter.fields([
  { name: 'previewImage', maxCount: 1 },
  { name: 'previewVideo', maxCount: 1 },
]);
export const uploadMediaAsset = mediaAssetMulter.single('file');
export const uploadChatInput = chatInputMulter.single('file');
export const uploadEditorMedia = editorMediaMulter.single('file');
export const uploadSupportAttachments = supportAttachmentMulter.array('files', 5);
export const uploadServiceLaunchInputs = serviceLaunchMulter.any();
