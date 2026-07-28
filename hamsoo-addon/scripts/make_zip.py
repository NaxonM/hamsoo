import zipfile
import os
import sys

source_dir = sys.argv[1]
output_zip = sys.argv[2]

if os.path.exists(output_zip):
    os.remove(output_zip)

with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(source_dir):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, source_dir)
            arcname = rel_path.replace('\\', '/')
            zipf.write(full_path, arcname)
