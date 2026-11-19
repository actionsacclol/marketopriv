import type { ModelFile } from './kokoroFiles';

// Whisper base (multilingual, 74M) for on-device captions: the ONNX export by
// onnx-community of openai/whisper-base (Apache-2.0 export, MIT weights),
// pinned to one revision with a SHA-256 for every file. The encoder stays full
// precision (quantizing it costs the most accuracy); the merged decoder (one
// graph with and without the KV cache) is the 8-bit one. The tokenizer needs
// only vocab.json (decoding never merges); config.json gives the layer and
// head counts, generation_config.json the special-token tables.

const BASE = 'https://huggingface.co/onnx-community/whisper-base/resolve/27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c';

export const WHISPER_FILES: readonly ModelFile[] = [
  { name: 'config.json', url: `${BASE}/config.json`, sha256: 'f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b', bytes: 2243 },
  { name: 'generation_config.json', url: `${BASE}/generation_config.json`, sha256: '61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0', bytes: 3832 },
  { name: 'vocab.json', url: `${BASE}/vocab.json`, sha256: '50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a', bytes: 1036584 },
  { name: 'decoder_model_merged_quantized.onnx', url: `${BASE}/onnx/decoder_model_merged_quantized.onnx`, sha256: 'fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b', bytes: 53693315 },
  { name: 'encoder_model.onnx', url: `${BASE}/onnx/encoder_model.onnx`, sha256: 'a9f3b752833b49e880dec91ee5b6d936112be7c3ea07c221024ba493439f46fe', bytes: 82468078 },
];

/** Written last, so its presence means every other file is in place. */
export const WHISPER_MARKER = 'encoder_model.onnx';

export const WHISPER_BYTES = WHISPER_FILES.reduce((s, f) => s + f.bytes, 0);
