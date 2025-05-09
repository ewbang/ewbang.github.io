import json

# 读取 JSON 文件
with open('data.json', 'r', encoding="utf-8") as f:
    data = json.load(f)

# 先按 "type" 排序，再按 "text" 的长度排序
sorted_data = sorted(data, key=lambda x: (x['type'], len(x['text'])))
# 打印排序后的数据
with open('data.json', 'w', encoding="utf-8") as f:
    f.write(json.dumps(sorted_data, ensure_ascii=False, indent=4))

