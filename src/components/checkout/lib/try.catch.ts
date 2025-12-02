export const tryCatch = async <T>(
  promise: Promise<T>,
): Promise<[T, undefined] | [undefined, Error]> => {
  return promise
    .then((data) => {
      return [data, undefined] as [T, undefined];
    })
    .catch((error) => {
      return [undefined, error] as [undefined, Error];
    });
};
