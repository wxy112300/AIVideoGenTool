export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageInspectionPort {
  readDimensions(filename: string): ImageDimensions;
}
