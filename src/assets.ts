import { AssetType, defineAssets } from '@iwsdk/core';
import { coverAssetId, resolveUrl, TRACKS } from './catalog.js';

// Sleeves with no art path get a drawn placeholder at runtime instead.
const covers = Object.fromEntries(
  TRACKS.filter((track) => track.art).map((track) => [
    coverAssetId(track),
    { url: resolveUrl(track.art), type: AssetType.Texture, name: track.title },
  ]),
);

export default defineAssets(covers);
