// An HTTP success with an empty result can mean RLS filtered out the object.
export function confirmsDeletion(result, path) {
  return !result?.error && Array.isArray(result?.data) && result.data.some((object) => object.name === path);
}
