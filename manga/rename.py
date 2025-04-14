import os
import re

def natural_keys(text):
    """Split text into a list of strings and integers for natural sorting."""
    return [int(chunk) if chunk.isdigit() else chunk for chunk in re.split(r'(\d+)', text)]

def list_files(folder_path):
    file_list = []
    for filename in os.listdir(folder_path):
        if filename.endswith(".jpg"):
            file_list.append(os.path.join(folder_path, filename))

    # Sort files using natural sorting based on the basename
    sorted_list = sorted(file_list, key=lambda x: natural_keys(os.path.basename(x)))
    return sorted_list

def rename_images(file_list, new_name):
    num = 1
    for filename in file_list:
        new_name_mod = f"{new_name}-{num}.jpg"
        path = os.path.dirname(filename)  # use os.path.dirname for portability
        new_path = os.path.join(path, new_name_mod)
        os.rename(filename, new_path)
        print(f'Renamed: "{filename}" -> "{new_name_mod}"')
        num += 1

if __name__ == "__main__":
    folder_path = input("Enter folder path: ")
    new_file_name = input("Enter desired filename: ")
    file_list = list_files(folder_path)
    print(file_list)
    rename_images(file_list, new_file_name)
