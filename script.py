import os
import re

# Directory containing your files
directory = r"./content/the-villainous-noble-loves-mom-heroines-too-much/chapter-8/"

# Pattern to match your files
pattern = re.compile(r"the-villainous-noble-loves-mom-heroines-too-much-(\d+)", re.IGNORECASE)

# List and sort by the number in the filename
files = sorted(
    [f for f in os.listdir(directory) if pattern.search(f)],
    key=lambda x: int(pattern.search(x).group(1))
)

# Rename sequentially starting from 1
for idx, filename in enumerate(files, start=1):
    ext = os.path.splitext(filename)[1]  # keep original extension
    new_name = f"{idx:03}{ext}"  # 001, 002, 003...
    old_path = os.path.join(directory, filename)
    new_path = os.path.join(directory, new_name)
    os.rename(old_path, new_path)
    print(f"Renamed: {filename} -> {new_name}")

print("Done!")
