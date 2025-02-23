import os

def rename_images(folder_path):
    for filename in os.listdir(folder_path):
        if filename.lower().endswith(".webp"):
            new_name = filename.replace(" ", "-").lower()
            old_path = os.path.join(folder_path, filename)
            new_path = os.path.join(folder_path, new_name)
            os.rename(old_path, new_path)
            print(f'Renamed: "{filename}" -> "{new_name}"')

# Change this to the path of your folder
folder_path = "./akira-momose-first-love/chapter-1"
rename_images(folder_path)
