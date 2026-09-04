#!/usr/bin/env python3
# Safari 빌드의 manifest.json 을 원본(extension/manifest.json)에서 생성한다.
# 백그라운드 스크립트와 nativeMessaging 권한은 Safari 에서만 필요하므로 여기서만 넣고,
# 원본은 다른 브라우저와 공유하므로 건드리지 않는다. 확장 타깃의 리소스 복사에서 manifest.json 은 제외돼 있다.
import json, shutil, sys, pathlib

source = pathlib.Path(sys.argv[1])
resources = pathlib.Path(sys.argv[2])
background_src = pathlib.Path(sys.argv[3])

manifest = json.loads(source.read_text(encoding="utf-8"))
permissions = manifest.setdefault("permissions", [])
if "nativeMessaging" not in permissions:
    permissions.append("nativeMessaging")
manifest["background"] = {"scripts": ["common.js", "background.js"], "persistent": False}
manifest.pop("browser_specific_settings", None)

# 디버그 빌드는 팝업 하단에 빌드 시각을 보여 설치본 구분을 쉽게 한다 (Release 는 버전만)
import os, datetime
if os.environ.get("CONFIGURATION", "") == "Debug":
    manifest["version_name"] = manifest["version"] + " (" + datetime.datetime.now().strftime("%m%d-%H%M") + ")"

resources.mkdir(parents=True, exist_ok=True)
(resources / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
shutil.copyfile(background_src, resources / "background.js")
