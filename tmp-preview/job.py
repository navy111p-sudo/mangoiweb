import urllib.request, io
from PIL import Image
U = {
 "a": "https://d8j0ntlcm91z4.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/hf_20260914_070922_552d110f-343e-4920-b3f0-780e8b74a37f.png",
 "b": "https://d8j0ntlcm91z4.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/hf_20260914_070922_b774231c-b35d-46bc-81b7-4ec8e6bff83d.png",
}
ims = []
for k, u in U.items():
    raw = urllib.request.urlopen(u, timeout=120).read()
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    print(k, im.size, len(raw))
    im.thumbnail((440, 440))
    ims.append((k, im))
W = sum(i.width for _, i in ims) + 10
H = max(i.height for _, i in ims)
sheet = Image.new("RGB", (W, H), (255, 255, 255))
x = 0
for k, i in ims:
    sheet.paste(i, (x, 0)); x += i.width + 10
sheet.save("tmp-preview/base-candidates.jpg", quality=88)
print("saved", sheet.size)
