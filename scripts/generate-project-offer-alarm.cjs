/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

const sampleRate = 44100;
const durationSeconds = 30;
const sampleCount = sampleRate * durationSeconds;
const pcm = Buffer.alloc(sampleCount * 2);

const cycleSeconds = 3.2;
const noteDuration = 0.72;
const motifs = [
  [
    [0, 1046.5, 0.76],
    [0.24, 1318.5, 0.7],
    [0.48, 1760, 0.64],
    [0.78, 1318.5, 0.58],
    [1.34, 784, 0.64],
    [1.58, 1046.5, 0.68],
    [1.82, 1568, 0.6],
  ],
  [
    [0, 987.77, 0.72],
    [0.24, 1318.5, 0.68],
    [0.48, 1568, 0.62],
    [0.78, 1174.66, 0.56],
    [1.34, 783.99, 0.62],
    [1.58, 987.77, 0.66],
    [1.82, 1318.5, 0.58],
  ],
];

function pluckSample(elapsed, frequency, amplitude) {
  if (elapsed < 0 || elapsed >= noteDuration) return 0;

  const attack = Math.min(1, elapsed / 0.008);
  const decay = Math.exp(-5.4 * elapsed);
  const release = Math.min(1, Math.max(0, (noteDuration - elapsed) / 0.12));
  const envelope = attack * decay * release;
  const phase = 2 * Math.PI * frequency * elapsed;

  const fundamental = Math.sin(phase) * 0.72;
  const warmOvertone = Math.sin(phase * 2) * 0.18;
  const bellOvertone = Math.sin(phase * 3.01) * 0.07;
  const shimmer = Math.sin(phase * 1.006) * 0.03;

  return (fundamental + warmOvertone + bellOvertone + shimmer) * amplitude * envelope;
}

for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  const cycleIndex = Math.floor(time / cycleSeconds);
  const timeInCycle = time % cycleSeconds;
  const motif = motifs[cycleIndex % motifs.length];

  let mixed = 0;
  for (const [start, frequency, amplitude] of motif) {
    mixed += pluckSample(timeInCycle - start, frequency, amplitude);
    mixed += pluckSample(timeInCycle - start - 0.095, frequency, amplitude * 0.16);
  }

  const sample = Math.max(-1, Math.min(1, mixed * 0.5));
  pcm.writeInt16LE(Math.round(sample * 32767), index * 2);
}

const output = Buffer.alloc(44 + pcm.length);
output.write('RIFF', 0);
output.writeUInt32LE(36 + pcm.length, 4);
output.write('WAVE', 8);
output.write('fmt ', 12);
output.writeUInt32LE(16, 16);
output.writeUInt16LE(1, 20);
output.writeUInt16LE(1, 22);
output.writeUInt32LE(sampleRate, 24);
output.writeUInt32LE(sampleRate * 2, 28);
output.writeUInt16LE(2, 32);
output.writeUInt16LE(16, 34);
output.write('data', 36);
output.writeUInt32LE(pcm.length, 40);
pcm.copy(output, 44);

const outputPath = path.join(__dirname, '..', 'assets', 'sounds', 'project_offer_alarm.wav');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);
console.log(`Generated ${outputPath} (${output.length} bytes)`);
