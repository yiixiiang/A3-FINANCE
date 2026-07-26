/**
 * Convert a browser File object into a data URL for local preview/storage.
 * Import this helper into management-app.tsx when you are ready to fix uploads.
 */
export function fileToData(
  file: File,
  callback: (name: string, data: string) => void,
): void {
  const reader = new FileReader();

  reader.onload = () => {
    if (typeof reader.result === "string") {
      callback(file.name, reader.result);
    }
  };

  reader.onerror = () => {
    console.error(`Unable to read file: ${file.name}`);
    window.alert("Unable to read the selected file.");
  };

  reader.readAsDataURL(file);
}
