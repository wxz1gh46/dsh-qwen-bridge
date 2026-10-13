import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const manifest=JSON.parse(readFileSync(new URL('../SOURCE.json',import.meta.url)));
for(const [file,expected] of Object.entries(manifest.sha256)) assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),expected,file);
// 只校验本仓库自己生成的哈希；upstream 的原始哈希作为溯源信息保留，不参与断言。
const count = Object.keys(manifest.sha256).length;
const upstream = manifest.upstream?.sourceCommit ?? '(unknown)';
console.log(`校验通过：${count} 个文件与 SOURCE.json 一致。`);
console.log(`派生自上游 ${upstream}（${manifest.upstream?.coreVersion ?? '?'} / Chrome ${manifest.upstream?.chromeVersion ?? '?'}）。`);
