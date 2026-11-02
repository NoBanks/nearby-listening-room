import { AssetType, defineAssets } from '@iwsdk/core';
import catalog from './catalog.json';

const covers = Object.fromEntries(
  catalog.map((track) => [
    `cover-${track.id}`,
    {
      url: `${import.meta.env.BASE_URL}catalog/covers/${track.id}.jpg`,
      type: AssetType.Texture,
      name: track.title,
    },
  ]),
);

export default defineAssets(covers);
