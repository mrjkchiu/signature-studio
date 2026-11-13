#!/usr/bin/env python3
"""字体子集化 + 转 WOFF2（P1 减包）

范围 = 笔顺数据覆盖的字 + GB2312 + ASCII + 常用标点，和 App 实际能动画的范围一致。
用法：python3 scripts/subset-fonts.py --src prototype/fonts --dest prototype/fonts-woff2 \
        --strokes prototype/data/strokes --fonts zhimangxing.ttf liujianmaocao.ttf ...
"""
import argparse, os, subprocess, sys

def build_charset(strokes_dir):
    chars = set()
    if os.path.isdir(strokes_dir):
        for f in os.listdir(strokes_dir):
            if f.endswith('.json'):
                chars.add(f[:-5])
    chars |= {chr(c) for c in range(0x20, 0x7f)}
    chars |= set('，。！？、：；“”‘’（）《》〈〉—…·「」【】')
    for hi in range(0xB0, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode('gb2312'))
            except Exception:
                pass
    return ''.join(sorted(chars))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--dest', required=True)
    ap.add_argument('--strokes', required=True)
    ap.add_argument('--fonts', nargs='+', required=True)
    a = ap.parse_args()

    os.makedirs(a.dest, exist_ok=True)
    chars = build_charset(a.strokes)
    char_file = os.path.join(a.dest, '_chars.txt')
    open(char_file, 'w', encoding='utf-8').write(chars)
    print(f'子集字符数: {len(chars)}')

    total_in = total_out = 0
    for f in a.fonts:
        src = os.path.join(a.src, f)
        if not os.path.exists(src):
            print(f'⚠ 缺字体，跳过: {f}')
            continue
        out = os.path.join(a.dest, f.replace('.ttf', '.woff2'))
        r = subprocess.run([
            sys.executable, '-m', 'fontTools.subset', src,
            '--text-file=' + char_file,
            '--flavor=woff2',
            '--output-file=' + out,
            '--layout-features=*', '--glyph-names', '--symbol-cmap', '--legacy-cmap',
            '--notdef-glyph', '--notdef-outline', '--recommended-glyphs',
        ], capture_output=True, text=True)
        if r.returncode != 0:
            print(f'⚠ 转换失败 {f}: {r.stderr.strip()[:120]}')
            continue
        i, o = os.path.getsize(src), os.path.getsize(out)
        total_in += i
        total_out += o
        print(f'  {f:<26}{i/1048576:6.1f}M → {o/1048576:5.1f}M')
    print(f'合计 {total_in/1048576:.1f}M → {total_out/1048576:.1f}M')

if __name__ == '__main__':
    main()
