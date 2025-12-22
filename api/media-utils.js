import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';

export async function convertToSticker(buffer, author = 'RC WA API', pack = 'Sticker Pack') {
    return new Promise((resolve, reject) => {
        const tempInput = path.join(tmpdir(), `${uuidv4()}.input`);
        const tempOutput = path.join(tmpdir(), `${uuidv4()}.webp`);

        fs.writeFileSync(tempInput, buffer);

        ffmpeg(tempInput)
            .inputFormat('image2')
            .on('error', (err) => {
                fs.unlinkSync(tempInput);
                reject(err);
            })
            .on('end', () => {
                const stickerBuffer = fs.readFileSync(tempOutput);
                fs.unlinkSync(tempInput);
                fs.unlinkSync(tempOutput);
                resolve(stickerBuffer);
            })
            .addOutputOptions([
                '-vcodec', 'libwebp',
                '-vf', 'scale=\'iw*min(300/iw\,300/ih)\':\'ih*min(300/iw\,300/ih)\',format=rgba,pad=300:300:\'(300-iw)/2\':\'(300-ih)/2\':\'#00000000\',setsar=1',
                '-loop', '0',
                '-ss', '00:00:00.0',
                '-t', '00:00:10.0',
                '-preset', 'default',
                '-an',
                '-vsync', '0',
                '-s', '512x512'
            ])
            .toFormat('webp')
            .save(tempOutput);
    });
}
