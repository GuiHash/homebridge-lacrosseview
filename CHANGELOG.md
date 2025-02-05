## [2.1.0](https://github.com/GuiHash/homebridge-lacrosseview/compare/v2.0.1...v2.1.0) (2025-02-05)

### Features

* add battery information ([#116](https://github.com/GuiHash/homebridge-lacrosseview/issues/116)) ([60311f8](https://github.com/GuiHash/homebridge-lacrosseview/commit/60311f800bae1d7d62f82a5e02448207e51aee4c))

## [2.0.1](https://github.com/GuiHash/homebridge-lacrosseview/compare/v2.0.0...v2.0.1) (2025-02-05)

### Bug Fixes

* unreachable lacrosse api endpoint ([#115](https://github.com/GuiHash/homebridge-lacrosseview/issues/115)) ([ab14306](https://github.com/GuiHash/homebridge-lacrosseview/commit/ab143065b32322bc9590e8162b067cbf5447c233))

## [2.0.0](https://github.com/GuiHash/homebridge-lacrosseview/compare/v1.2.0...v2.0.0) (2025-01-05)

### ⚠ BREAKING CHANGES

* bump min compat for node to 18.20 and homebridge to 1.8

### Features

* homebridge v2 compat ([#106](https://github.com/GuiHash/homebridge-lacrosseview/issues/106)) ([89214a0](https://github.com/GuiHash/homebridge-lacrosseview/commit/89214a0e7e074d1faab53ed8122cb804717ff06d))

### Documentations

* update CHANGELOG.md ([2208501](https://github.com/GuiHash/homebridge-lacrosseview/commit/2208501a57d980bfee37d3bd63741a115540dc0c))

## [1.2.0](https://github.com/GuiHash/homebridge-lacrosseview/compare/v1.1.0...v1.2.0) (2021-06-06)


### Features

* add support for excluding specific locations and specific devices ([#43](https://github.com/GuiHash/homebridge-lacrosseview/issues/43)) ([98526a5](https://github.com/GuiHash/homebridge-lacrosseview/commit/98526a50489f7149e4c144f5bbbce0749a023b8b)) and ([#60](https://github.com/GuiHash/homebridge-lacrosseview/issues/60)) ([0bb8ee0](https://github.com/GuiHash/homebridge-lacrosseview/commit/0bb8ee0826913d315168afb19f416c94ff22850f))
* do not create accessory when device is not supported ([#65](https://github.com/GuiHash/homebridge-lacrosseview/issues/65)) ([3c7951b](https://github.com/GuiHash/homebridge-lacrosseview/commit/3c7951bcbaa0d828df183c04d2af50480f95fcfe))


### Bug Fixes

* history in elgato app ([#49](https://github.com/GuiHash/homebridge-lacrosseview/issues/49)) ([10df0a5](https://github.com/GuiHash/homebridge-lacrosseview/commit/10df0a58bf580bee5dcdae696bc004da26873759))
* typo Elegato --> Elgato ([#14](https://github.com/GuiHash/homebridge-lacrosseview/issues/14)) ([6570ebe](https://github.com/GuiHash/homebridge-lacrosseview/commit/6570ebea16d7ded911932bcd5e899fbb802bf321))


### Chore

* fix security update ([#67](https://github.com/GuiHash/homebridge-lacrosseview/issues/67)) ([7b5fdfa](https://github.com/GuiHash/homebridge-lacrosseview/commit/7b5fdfa0ada2a821f932fd82dcc66126d494f8b4))
* upgrade dependencies ([#66](https://github.com/GuiHash/homebridge-lacrosseview/issues/66)) ([72c93e5](https://github.com/GuiHash/homebridge-lacrosseview/commit/72c93e5a9f3602f3b12171d9db4a6ef99108b83e))
* upgrade to GitHub-native Dependabot ([#36](https://github.com/GuiHash/homebridge-lacrosseview/issues/36)) ([7b6ac6c](https://github.com/GuiHash/homebridge-lacrosseview/commit/7b6ac6c6f0f2c35c79f0b2f1df46fcbcf120453c))


### Documentations

* typo in readme ([#68](https://github.com/GuiHash/homebridge-lacrosseview/issues/68)) ([b5c3e6f](https://github.com/GuiHash/homebridge-lacrosseview/commit/b5c3e6f475acad7ca37cef2826eed95dd6a90aa1))

## [1.1.0](https://github.com/GuiHash/homebridge-lacrosseview/compare/v1.0.1...v1.1.0) (2021-03-29)


### Features

* add fakegato history for elgato eve app ([#12](https://github.com/GuiHash/homebridge-lacrosseview/issues/12)) ([c11397c](https://github.com/GuiHash/homebridge-lacrosseview/commit/c11397c1c3944f41f56c296564f06e9b4aa8f2d2))


### Bug Fixes

* create only necessary service on accessories ([#13](https://github.com/GuiHash/homebridge-lacrosseview/issues/13)) ([264dce6](https://github.com/GuiHash/homebridge-lacrosseview/commit/264dce630f77ec55df96496748be16616edad022))
* sensors should be always active except when an error occured ([#11](https://github.com/GuiHash/homebridge-lacrosseview/issues/11)) ([1727553](https://github.com/GuiHash/homebridge-lacrosseview/commit/1727553c25833221ed646a9273fe826162b3894b))


### Documentations

* error default fakeGatoStoragePath in readme ([eb19ffd](https://github.com/GuiHash/homebridge-lacrosseview/commit/eb19ffd37bbe35ad354f06b0d888a4bd316e7201))

### [1.0.1](https://github.com/GuiHash/homebridge-lacrosseview/compare/v1.0.0...v1.0.1) (2021-03-22)


### Bug Fixes

* accessories added multiple times ([#7](https://github.com/GuiHash/homebridge-lacrosseview/issues/7)) ([de2ad79](https://github.com/GuiHash/homebridge-lacrosseview/commit/de2ad798227773d89eeadc0606f1a7c33935a973))


### Documentations

* wrong manual instruction ([efd4d38](https://github.com/GuiHash/homebridge-lacrosseview/commit/efd4d38f30b8220591a1af93315ecd72e86fbf8d))


### Chore

* bump deps ([#8](https://github.com/GuiHash/homebridge-lacrosseview/issues/8)) ([2b28e53](https://github.com/GuiHash/homebridge-lacrosseview/commit/2b28e53ec82c1ea081bedcfe891340fa8e65e5bb))

## 1.0.0 (2021-03-07)


### Bug Fixes

* better error manager ([9da553a](https://github.com/GuiHash/homebridge-lacrosseview/commit/9da553a47fc73eb750394852b00d39043d84faa7))
* no console allowed ([5b58621](https://github.com/GuiHash/homebridge-lacrosseview/commit/5b5862187adb06a1b5730d169ba8915cc301b024))


### Chore

* bump dependencies ([dadb8d2](https://github.com/GuiHash/homebridge-lacrosseview/commit/dadb8d2fdc0a43a6dc36adc73494c4507d08d3e8))
