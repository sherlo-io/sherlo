export const breakIntoLines = (string: string) => {
  const words = string.split(" ");
  const lines = words.join("\n");
  return lines;
};
