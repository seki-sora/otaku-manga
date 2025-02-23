import os

def rename_images(folder_path):
    num = 1
    for filename in os.listdir(folder_path):
        if filename.lower().endswith(".webp"):
            new_name = f"i-got-a-new-skill-every-time-i-was-exiled-and-after-100-different-worlds-i-was-unmatched-{num}.webp"
            old_path = os.path.join(folder_path, filename)
            new_path = os.path.join(folder_path, new_name)
            os.rename(old_path, new_path)
            num += 1
            print(f'Renamed: "{filename}" -> "{new_name}"')

# Change this to the path of your folder
folder_path = "./i-got-a-new-skill-every-time-i-was-exiled, and-after-100-different-worlds,-i-was-unmatched/chapter-1"
rename_images(folder_path)
