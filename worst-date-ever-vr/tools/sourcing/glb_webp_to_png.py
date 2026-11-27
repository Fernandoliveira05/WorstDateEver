"""Replace embedded WebP images in a GLB with PNG (Unity glTFast has no WebP)."""
from __future__ import annotations
import io, json, struct, sys
from pathlib import Path
from PIL import Image

def convert(path: Path) -> bool:
    data = path.read_bytes()
    if data[:4] != b'glTF':
        return False
    _, _, total = struct.unpack_from('<III', data, 0)
    pos, chunks = 12, []
    while pos < total:
        length, kind = struct.unpack_from('<II', data, pos); pos += 8
        chunks.append((kind, data[pos:pos+length])); pos += length
    doc = json.loads(chunks[0][1])
    binary = bytearray(chunks[1][1]) if len(chunks) > 1 else bytearray()
    changed = False
    for texture in doc.get('textures', []):
        extension = (texture.get('extensions') or {}).pop('EXT_texture_webp', None)
        if extension and 'source' in extension:
            texture['source'] = extension['source']
            changed = True
        if texture.get('extensions') == {}:
            texture.pop('extensions')
    for key in ('extensionsUsed', 'extensionsRequired'):
        if key in doc and 'EXT_texture_webp' in doc[key]:
            doc[key] = [value for value in doc[key] if value != 'EXT_texture_webp']
            changed = True
    for image in doc.get('images', []):
        if image.get('mimeType') != 'image/webp' or 'bufferView' not in image:
            continue
        view = doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0); end = start + view['byteLength']
        raw = bytes(binary[start:end])
        png = io.BytesIO()
        Image.open(io.BytesIO(raw)).convert('RGBA').save(png, format='PNG')
        payload = png.getvalue()
        while len(binary) % 4: binary.append(0)
        offset = len(binary); binary.extend(payload)
        while len(binary) % 4: binary.append(0)
        view.clear(); view.update({'buffer': 0, 'byteOffset': offset, 'byteLength': len(payload)})
        image['mimeType'] = 'image/png'
        changed = True
    if not changed:
        return False
    doc['buffers'][0]['byteLength'] = len(binary)
    js = json.dumps(doc, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    bin_pad = bytes(binary)
    while len(bin_pad) % 4: bin_pad += b'\0'
    out = bytearray(b'glTF' + struct.pack('<I', 2) + b'\0\0\0\0')
    out += struct.pack('<II', len(js), 0x4E4F534A) + js
    out += struct.pack('<II', len(bin_pad), 0x004E4942) + bin_pad
    struct.pack_into('<I', out, 8, len(out))
    path.write_bytes(out)
    return True

for arg in sys.argv[1:]:
    changed = convert(Path(arg))
    print(('converted ' if changed else 'unchanged ') + arg)
