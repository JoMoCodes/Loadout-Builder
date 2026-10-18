// The Weekly Snapshot: two phone-sized pages that ride along in the report email beside the PDF.
//
//   buildSnapshotHtml(model, look)         both pages as one HTML document (the preview)
//   snapshotPageBody / pages [1] or [2]    one page, for drawing to a picture
//   renderSnapshotBatch(pages[])           pictures of many snapshots, in one hidden window
//   snapshotEmailHtml / snapshotEmailText  the email around the pictures
//   readSnapshotPhoto(file)                the DSP's header photo
//   sampleSnapshotModel()                  made-up numbers for the preview with no driver

export {
  buildSnapshotHtml,
  snapshotPageBody,
  SNAPSHOT_WIDTH,
  type SnapshotLook,
  type SnapshotPage,
  type SnapshotPhoto,
} from './html';
export { inlineImages, snapshotEmailHtml, snapshotEmailText, type InlineImage } from './email';
export {
  IMAGE_MAX_BYTES,
  renderSnapshotBatch,
  renderSnapshotPages,
  SnapshotRenderError,
  type SnapshotImage,
} from './render';
export {
  PHOTO_EXTENSIONS,
  PHOTO_MAX_BYTES,
  photoFromBytes,
  readSnapshotPhoto,
  type PhotoProblem,
} from './photo';
export { sampleSnapshotModel } from './sample';
