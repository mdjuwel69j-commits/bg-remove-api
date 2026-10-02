import sys
import os
from rembg import remove
from PIL import Image
import io

def remove_background(input_path, output_path):
    try:
        print(f"[INFO] Starting background removal for: {input_path}")
        
        # Read input image
        with open(input_path, 'rb') as input_file:
            input_data = input_file.read()
        
        print(f"[INFO] Image loaded: {len(input_data)} bytes")
        
        # Remove background
        print("[INFO] Running rembg model...")
        output_data = remove(input_data)
        
        if output_data is None:
            raise ValueError('rembg.remove() returned None')
        
        print(f"[INFO] Background removed, output size: {len(output_data)} bytes")
        
        # Save output as PNG
        with open(output_path, 'wb') as output_file:
            output_file.write(output_data)
        
        print(f"[INFO] Output saved to: {output_path}")
        print('SUCCESS')
        return True
    except Exception as exc:
        print(f'ERROR: {exc}')
        import traceback
        traceback.print_exc()
        return False

def main():
    if len(sys.argv) != 3:
        print('Usage: python model.py <input_path> <output_path>')
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f'ERROR: Input file "{input_path}" does not exist')
        sys.exit(1)

    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    success = remove_background(input_path, output_path)
    if not success:
        sys.exit(1)

if __name__ == '__main__':
    main()
