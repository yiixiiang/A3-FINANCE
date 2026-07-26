const MAX_FILE_SIZE_BYTES = 1_500_000;

export function fileToData(
  file: File,
  done: (name: string, data: string) => void,
): void {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    window.alert("Please choose a file smaller than 1.5 MB.");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    if (typeof reader.result === "string") {
      done(file.name, reader.result);
      return;
    }

    window.alert(`Unable to read ${file.name}. Please choose another file.`);
  };

  reader.onerror = () => {
    window.alert(`Unable to read ${file.name}. Please choose another file.`);
  };

  reader.readAsDataURL(file);
}
