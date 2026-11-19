# 11-13 I10（Rhett 01:29「是新的 6 职业，用 40 级套装」「概念图」「取头部」）：六职业头像统一用 40 级套装概念图裁头部 → src/dlc/dlc1/icons/pl_<cls>.jpg（0 积分）
#   源：anyan-cloud/02_工程包/03_宣发/宣发/报告书/src/img/c40_<cls>.jpg（600×900，暗底，LFS，按需 lfs pull --include）
import sys
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/work/anyan-cloud/02_工程包/03_宣发/宣发/报告书/src/img/'
BOX = (215, 0, 385, 170)   # 六张构图一致，头部都在顶部正中
for cls in ['warrior', 'mage', 'chrono', 'alchemy', 'hunter', 'coffin']:
    Image.open(SRC + f'c40_{cls}.jpg').convert('RGB').crop(BOX).resize((192, 192), Image.LANCZOS).save(f'src/dlc/dlc1/icons/pl_{cls}.jpg', quality=90)
    print('pl_' + cls)
