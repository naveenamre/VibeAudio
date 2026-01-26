# main_maker.py
import json
from pathlib import Path

def main():
    root = Path(".").resolve()                    # roughwork
    book_folder = root / "book_folder"
    books_data_root = root.parent                 # ../ (books_data)

    # load base json inside book_folder
    base_json_file = next(book_folder.glob("*.json"))
    base_name = base_json_file.name               # e.g. harry_potter_2.json

    # load chapters.json
    chapters_file = root / "chapters.json"
    chapters_list = json.loads(chapters_file.read_text(encoding="utf-8"))

    # read main JSON from books_data folder
    main_json_path = books_data_root / base_name
    if not main_json_path.exists():
        print(f"ERROR: Main JSON not found at: {main_json_path}")
        return

    main_data = json.loads(main_json_path.read_text(encoding="utf-8"))

    title = main_data["title"]

    # build chapter list
    chapters_output = []
    for i, ch in enumerate(chapters_list, start=1):
        num = str(i).zfill(2)
        audio = f"{num}-chapter.m4a"
        chapters_output.append({
            "name": ch["name"],
            "url": f"{title}/{audio}"
        })

    # inject chapters into main JSON
    main_data["chapters"] = chapters_output

    # overwrite the existing main JSON file
    main_json_path.write_text(
        json.dumps(main_data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"Updated MAIN JSON: {main_json_path}")

if __name__ == "__main__":
    main()
