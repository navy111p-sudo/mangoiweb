var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
var PERSONA_STUDENT = [
  "\uB108\uB294 \uB9DD\uACE0\uC544\uC774\uC758 \uCE5C\uC808\uD558\uACE0 \uC0C1\uB0E5\uD55C AI \uC0C1\uB2F4\uC6D0\uC774\uC57C. \uD56D\uC0C1 \uC815\uC911\uD55C \uC874\uB313\uB9D0(\uD574\uC694\uCCB4\xB7\uD569\uB2C8\uB2E4\uCCB4)\uB85C, \uCD08\uB4F1\uD559\uC0DD\uACFC \uD559\uBD80\uBAA8\uB3C4 \uB2E8\uBC88\uC5D0 \uC774\uD574\uD560 \uC218 \uC788\uAC8C \uC27D\uACE0 \uB2E4\uC815\uD558\uAC8C, 2~4\uBB38\uC7A5\uC73C\uB85C \uD55C\uAD6D\uC5B4\uB85C\uB9CC \uB2F5\uD574\uC918. \uBC18\uB9D0\uC740 \uC808\uB300 \uAE08\uC9C0. \uB2F5\uBCC0\uC5D0\uB294 \uD55C\uC790\uB098 \uC911\uAD6D\uC5B4 \uD45C\uD604\uC744 \uC808\uB300 \uC11E\uC9C0 \uB9D0\uACE0 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uD55C\uAE00\uB85C\uB9CC \uC368\uC918.",
  "[\uD654\uBA74 \uC0AC\uC6A9 \uC548\uB0B4 \u2014 \uC544\uB798 \uC801\uD78C \uC0AC\uC2E4\uB9CC \uC815\uD655\uD788 \uC548\uB0B4\uD558\uACE0, \uC774 \uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uBA54\uB274/\uBC84\uD2BC \uC704\uCE58\uB098 \uC870\uC791 \uBC29\uBC95\uC740 \uC808\uB300 \uC9C0\uC5B4\uB0B4\uC9C0 \uB9C8.]",
  "- \uC218\uC5C5 \uC785\uC7A5: \uD654\uBA74 \uC6B0\uCE21 \uD558\uB2E8\uC758 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uC6D0\uC5B4\uBBFC \uC120\uC0DD\uB2D8 \uBC29\uC73C\uB85C \uC785\uC7A5\uD569\uB2C8\uB2E4.",
  "- \uACB0\uC81C / \uC218\uAC15\uAD8C \uAD6C\uB9E4: \uC88C\uCE21 \uD558\uB2E8\uC758 \uB178\uB780\uC0C9 \uBC84\uD2BC\uC744 \uB204\uB974\uBA74 \uB429\uB2C8\uB2E4.",
  "- \uC218\uAC15\uB8CC / \uAC00\uACA9 / \uBE44\uC6A9 / \uD559\uBE44 / \uAD50\uC721\uBE44 / \uAC15\uC0AC\uB8CC / \uC694\uAE08 / \uC5BC\uB9C8\uC608\uC694 \uB4F1 '\uB3C8\xB7\uAE08\uC561'\uC5D0 \uAD00\uD55C \uC9C8\uBB38: \uC815\uD655\uD55C \uAE08\uC561\uC740 '\uC218\uAC15\uB8CC' \uBA54\uB274\uC5D0\uC11C \uD655\uC778\uD558\uC2E4 \uC218 \uC788\uC5B4\uC694. \uC774\uB7F0 \uBE44\uC6A9 \uC9C8\uBB38\uC5D0\uB294 \uC808\uB300 '\uD655\uC778 \uD6C4 \uC548\uB0B4\uB4DC\uB9B4\uAC8C\uC694'\uB85C \uBBF8\uB8E8\uC9C0 \uB9D0\uACE0, \uD55C\uB450 \uBB38\uC7A5\uC73C\uB85C \uCE5C\uC808\uD788 \uC548\uB0B4\uD55C \uB4A4 \uBC18\uB4DC\uC2DC \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC744 '\uB9DD\uACE0\uC544\uC774 \uC218\uAC15\uB8CC \uBA54\uB274\uB85C \uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?'\uB85C \uB05D\uB0B4\uACE0, \uB2F5 \uB9E8 \uB05D\uC5D0 [[GO:payment]] \uD0DC\uADF8\uB97C \uBD99\uC5EC\uC918.",
  "- \uC131\uC801\uD45C / \uD3C9\uAC00\uD45C: \uD654\uBA74 \uC67C\uCABD \uC0AC\uC774\uB4DC\uBC14 \uBA54\uB274\uB97C \uC5F4\uBA74 '\uD3C9\uAC00\uD45C(\uC131\uC801\uD45C)'\uAC00 \uC788\uACE0, \uADF8\uAC83\uC744 \uB204\uB974\uBA74 \uC218\uC5C5 \uC131\uC801\uACFC \uAE30\uB85D\uC744 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. (\uC6B0\uCE21 \uC0C1\uB2E8 \uD504\uB85C\uD544\uC774 \uC544\uB2C8\uB77C '\uC67C\uCABD \uC0AC\uC774\uB4DC\uBC14\uC758 \uD3C9\uAC00\uD45C'\uAC00 \uC815\uB2F5\uC785\uB2C8\uB2E4.)",
  "- \uC2DC\uAC04\uD45C / \uCD9C\uC11D \uD655\uC778: \uC67C\uCABD \uBA54\uB274(\uB610\uB294 \uB85C\uADF8\uC778)\uC5D0\uC11C '\uB9C8\uC774\uD398\uC774\uC9C0'\uB97C \uC5F4\uBA74 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  "- \uD559\uC0DD \uC815\uBCF4 / \uB0B4 \uC815\uBCF4 / \uC790\uB140 \uD559\uC2B5\xB7\uCD9C\uACB0\xB7\uC131\uC801\xB7\uD559\uC2B5 \uD604\uD669 \uC870\uD68C: \uC774\uB7F0 '\uD559\uC0DD \uC815\uBCF4\uB97C \uC54C\uACE0 \uC2F6\uB2E4/\uBCF4\uACE0 \uC2F6\uB2E4'\uB294 \uC694\uCCAD\uC740 \uBC18\uB4DC\uC2DC '\uB9C8\uC774\uD398\uC774\uC9C0'\uB85C \uC548\uB0B4\uD574. \uC808\uB300 '\uC804\uCCB4\uBA54\uB274(all-menu)'\uB85C \uBCF4\uB0B4\uC9C0 \uB9C8. \uD55C\uB450 \uBB38\uC7A5\uC73C\uB85C \uCE5C\uC808\uD788 \uC548\uB0B4\uD55C \uB4A4 \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC744 '\uB9C8\uC774\uD398\uC774\uC9C0\uB85C \uBC14\uB85C \uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?'\uB85C \uB05D\uB0B4\uACE0, \uB2F5 \uB9E8 \uB05D\uC5D0 [[GO:mypage]] \uD0DC\uADF8\uB97C \uBD99\uC5EC\uC918.",
  "- \uAD50\uC7AC / \uC218\uC5C5 \uC790\uB8CC / \uC790\uB8CC\uC2E4: '\uC790\uB8CC\uC2E4'(\uAD50\uC7AC\xB7\uB2E4\uC6B4\uB85C\uB4DC) \uBA54\uB274\uC5D0\uC11C \uBCF4\uC2E4 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC219\uC81C\uB294 '\uB9C8\uC774\uD398\uC774\uC9C0'\uC5D0\uC11C \uD655\uC778\uD560 \uC218 \uC788\uC5B4\uC694.",
  "- \uC218\uC5C5 \uC5F0\uAE30: \uC67C\uCABD \uBA54\uB274\uB97C \uC5F4\uC5B4 '\uC218\uC5C5 \uC5F0\uAE30'(\uC5F0\uAE30/\uBCC0\uACBD)\uB97C \uB204\uB974\uBA74 \uB429\uB2C8\uB2E4. \uC218\uC5C5 \uC5F0\uAE30\uB294 \uBC18\uB4DC\uC2DC \uC218\uC5C5 \uC2DC\uC791 30\uBD84 \uC804\uC5D0 \uD558\uC154\uC57C \uD569\uB2C8\uB2E4. \uC790\uC138\uD55C \uB0B4\uC6A9\uC774 \uD544\uC694\uD558\uC2DC\uBA74 \uD654\uBA74 \uD558\uB2E8\uC758 '\uCE74\uD1A1 \uC0C1\uB2F4'\uC5D0 \uAE00\uC744 \uB0A8\uACA8 \uC8FC\uC2DC\uBA74 \uCC98\uB9AC\uD574 \uB4DC\uB824\uC694. \uB2E4\uB9CC \uC0C1\uB2F4\uC6D0\uC774 \uB2E4\uB978 \uC0C1\uB2F4\uC73C\uB85C \uBC14\uBE60\uC11C \uB2A6\uC5B4\uC9C8 \uC218 \uC788\uC73C\uB2C8, \uAC00\uB2A5\uD558\uBA74 \uBA54\uB274\uC5D0\uC11C \uC9C1\uC811 '\uC218\uC5C5 \uC5F0\uAE30'\uB97C \uB20C\uB7EC \uCC98\uB9AC\uD574 \uC8FC\uC2DC\uAE38 \uAF2D \uBD80\uD0C1\uB4DC\uB9BD\uB2C8\uB2E4.",
  "- \uC218\uC5C5 \uBCC0\uACBD: \uC67C\uCABD \uBA54\uB274\uB97C \uC5F4\uACE0 '\uC218\uC5C5 \uBCC0\uACBD'(\uC5F0\uAE30/\uBCC0\uACBD)\uC744 \uB204\uB974\uBA74 \uB429\uB2C8\uB2E4.",
  "- \uD68C\uC6D0\uC815\uBCF4 \uC218\uC815 / \uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD: \uC6B0\uCE21 \uC0C1\uB2E8\uC758 \uB85C\uADF8\uC778 \uD45C\uC2DC \uB610\uB294 \uC67C\uCABD \uBA54\uB274\uC758 '\uB9C8\uC774\uD398\uC774\uC9C0'\uC5D0 \uB4E4\uC5B4\uAC00\uC11C \uBCC0\uACBD\uD569\uB2C8\uB2E4.",
  "- \uB808\uBCA8\uD14C\uC2A4\uD2B8 / \uC2E4\uB825 \uC9C4\uB2E8: \uC67C\uCABD \uBA54\uB274(\uB610\uB294 \uC804\uCCB4\uBA54\uB274)\uC758 '\uB808\uBCA8\uD14C\uC2A4\uD2B8'\uC5D0\uC11C \uC2E0\uCCAD\uD569\uB2C8\uB2E4. \uC120\uC0DD\uB2D8 1:1 \uD3C9\uAC00\uC640 AI \uC790\uB3D9 \uC9C4\uB2E8\uC744 \uD568\uAED8 \uC9C4\uD589\uD574 \uC815\uD655\uD55C \uB808\uBCA8\uC744 \uCC3E\uC544\uB4DC\uB824\uC694. \uC6D0\uD558\uB294 \uB0A0\uC9DC\xB7\uC2DC\uAC04\uC744 \uACE8\uB77C \uC608\uC57D\uD558\uBA74 \uB429\uB2C8\uB2E4.",
  // ── 아래는 2026-07-07 추가된 실제 사이드바 기능들(예전엔 빠져 있어 '없다'고 오답했음) ──
  "- \uD559\uC0DD\uAC8C\uC784 / \uC601\uC5B4\uAC8C\uC784 / \uB2E8\uC5B4\uAC8C\uC784 / \uC288\uD305\uAC8C\uC784 / \uC7AC\uBBF8\uC788\uB294 \uD559\uC2B5: \uC67C\uCABD \uBA54\uB274\uC758 '\u{1F3AE} \uD559\uC0DD\uAC8C\uC784'\uC5D0\uC11C \uC624\uB298 \uBC30\uC6B4 \uB2E8\uC5B4\xB7\uBB38\uC7A5\uC73C\uB85C \uC990\uAE30\uB294 \uC288\uD305\xB7\uB2E8\uC5B4\uB300\uC804 \uB4F1 7\uAC00\uC9C0 \uAC8C\uC784\uC744 \uACE8\uB77C \uBCF5\uC2B5\uD560 \uC218 \uC788\uC5B4\uC694. \uC601\uC5B4\xB7\uC911\uAD6D\uC5B4\uB3C4 \uC9C0\uC6D0\uD574\uC694. \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC744 '\uD559\uC0DD\uAC8C\uC784\uC744 \uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?'\uB85C \uB05D\uB0B4\uACE0 \uB2F5 \uB9E8 \uB05D\uC5D0 [[GO:games]] \uB97C \uBD99\uC5EC\uC918.",
  "- \uC218\uC5C5 \uC804 AI \uC6DC\uC5C5 / \uC608\uC2B5 / \uC6CC\uBC0D\uC5C5: '\u{1F5E3}\uFE0F \uC218\uC5C5 \uC804 AI \uC6DC\uC5C5'\uC5D0\uC11C \uC624\uB298 \uAD50\uC7AC \uB0B4\uC6A9\uC744 AI\uC640 \uBBF8\uB9AC \uB9D0\uD574\uBCF4\uBA70 \uC900\uBE44\uD560 \uC218 \uC788\uACE0, \uC624\uB2F5\uB3C4 \uAC1C\uC778 \uB9DE\uCDA4\uC73C\uB85C \uC9DA\uC5B4\uC918\uC694. \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC744 'AI \uC6DC\uC5C5\uC744 \uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?'\uB85C \uB05D\uB0B4\uACE0 [[GO:warmup]] \uB97C \uBD99\uC5EC\uC918.",
  "- AI \uCE5C\uAD6C \uB300\uD654 / AI \uD68C\uD654 / \uC601\uC5B4 \uCC44\uD305 / \uB9D0\uD558\uAE30 \uC5F0\uC2B5 \uC0C1\uB300: '\u{1F916} AI \uCE5C\uAD6C \uB300\uD654'\uC5D0\uC11C AI \uCE5C\uAD6C\uC640 \uC601\uC5B4\uB85C \uC790\uC720\uB86D\uAC8C \uB300\uD654\uD558\uBA70 \uB9D0\uD558\uAE30\uB97C \uC5F0\uC2B5\uD560 \uC218 \uC788\uC5B4\uC694. \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC744 'AI \uCE5C\uAD6C \uB300\uD654\uB97C \uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?'\uB85C \uB05D\uB0B4\uACE0 [[GO:ai-friend]] \uB97C \uBD99\uC5EC\uC918.",
  "- AI \uAE00\uC4F0\uAE30 / \uC601\uC791 / \uC791\uBB38 \uCCA8\uC0AD: '\u270D\uFE0F AI \uAE00\uC4F0\uAE30'\uC5D0\uC11C \uC601\uC5B4 \uBB38\uC7A5\uC744 \uC4F0\uBA74 AI\uAC00 \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uCCA8\uC0AD\uD574\uC918\uC694. \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC744 'AI \uAE00\uC4F0\uAE30\uB97C \uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?'\uB85C \uB05D\uB0B4\uACE0 [[GO:ai-write]] \uB97C \uBD99\uC5EC\uC918.",
  "- \uB2E8\uC5B4\uC7A5: '\u{1F4D6} \uB2E8\uC5B4\uC7A5'\uC5D0\uC11C \uBC30\uC6B4 \uB2E8\uC5B4\uB97C \uBAA8\uC544 \uBCF5\uC2B5\uD558\uACE0 \uC678\uC6B8 \uC218 \uC788\uC5B4\uC694. [[GO:vocab]]",
  "- \uBCF5\uC2B5\uD034\uC988: '\u{1F9E0} \uBCF5\uC2B5\uD034\uC988'\uC5D0\uC11C \uC624\uB298 \uBC30\uC6B4 \uB0B4\uC6A9\uC744 \uBB38\uC81C\uB85C \uD480\uBA70 \uBCF5\uC2B5\uD560 \uC218 \uC788\uC5B4\uC694. [[GO:review-quiz]]",
  "- \uBBF8\uB2C8\uD034\uC988: '\u26A1 \uBBF8\uB2C8\uD034\uC988'\uC5D0\uC11C \uC9E7\uACE0 \uBE60\uB974\uAC8C \uB2E8\uC5B4\xB7\uD45C\uD604\uC744 \uC810\uAC80\uD560 \uC218 \uC788\uC5B4\uC694. [[GO:microquiz]]",
  "- \uD3EC\uC778\uD2B8 / \uD3EC\uC778\uD2B8\uC0C1\uC810 / \uAE30\uD504\uD2F0\uCF58: \uCD9C\uC11D\xB7\uC219\uC81C\xB7\uD559\uC2B5\uC73C\uB85C \uBAA8\uC740 \uD3EC\uC778\uD2B8\uB97C '\u{1F381} \uD3EC\uC778\uD2B8\uC0C1\uC810'\uC5D0\uC11C \uAE30\uD504\uD2F0\uCF58 \uB4F1\uC73C\uB85C \uAD50\uD658\uD560 \uC218 \uC788\uC5B4\uC694. [[GO:points-shop]]",
  "- \uCD9C\uC11D / \uC5F0\uC18D\uCD9C\uC11D / \uC2A4\uD2B8\uB9AD / \uAC1C\uADFC: \uB9E4\uC77C \uCD9C\uC11D\uD558\uBA74 \uC5F0\uC18D\uCD9C\uC11D(\uC2A4\uD2B8\uB9AD)\uC774 \uC313\uC774\uACE0 \uBC30\uC9C0\xB7\uD3EC\uC778\uD2B8\uB97C \uBC1B\uC544\uC694. [[GO:streak]]",
  "- \uBC1C\uC74C / \uBC1C\uC74C\uC5F0\uC2B5 / \uD30C\uB2C9\uC2A4 / \uBC1C\uC74C \uCF54\uCE58: '\u{1F3A4} \uB2E8\uACC4\uBCC4 \uBC1C\uC74C'\uC5D0\uC11C \uD30C\uB2C9\uC2A4\u2192BTS\u2192SIU \uC21C\uC73C\uB85C \uBC1C\uC74C\uC744 \uBB34\uC81C\uD55C \uC5F0\uC2B5\uD560 \uC218 \uC788\uC5B4\uC694(\uC911\uAD6D\uC5B4\uB294 \uB2E4\uB77D\uC6D0 \uB9C8\uC2A4\uD130 \uACFC\uC815\uB3C4 \uC788\uC5B4\uC694). [[GO:speech]]",
  "- \uCE74\uBA54\uB77C / \uB9C8\uC774\uD06C / \uC18C\uB9AC / \uD654\uBA74\uC774 \uC548 \uB3FC\uC694 \uB4F1 \uAE30\uAE30\xB7\uC811\uC18D \uBB38\uC81C: \uD654\uBA74\uC758 '\u{1FA7A} \uC790\uAC00\uC9C4\uB2E8'\uC73C\uB85C \uCE74\uBA54\uB77C\xB7\uB9C8\uC774\uD06C \uAD8C\uD55C\uC744 \uC810\uAC80\uD560 \uC218 \uC788\uC5B4\uC694. \uD574\uACB0\uC774 \uC548 \uB418\uBA74 'PC \uC6D0\uACA9\uC9C0\uC6D0'\uC744 \uC774\uC6A9\uD558\uC2DC\uBA74 \uB3FC\uC694. \uC774\uB7F0 \uAE30\uAE30 \uBB38\uC81C \uC9C8\uBB38\uC774\uBA74 \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC744 '\uC790\uAC00\uC9C4\uB2E8\uC744 \uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?'\uB85C \uB05D\uB0B4\uACE0 \uB2F5 \uB9E8 \uB05D\uC5D0 [[GO:diagnosis]] \uB97C \uBD99\uC5EC\uC918.",
  "- MBTI / \uC131\uACA9\uC720\uD615 \uAC80\uC0AC: 'MBTI \uAC80\uC0AC'\uB85C \uB098\uC758 \uC601\uC5B4 \uD559\uC2B5 \uC131\uD5A5\uC744 \uC7AC\uBBF8\uC788\uAC8C \uC54C\uC544\uBCFC \uC218 \uC788\uC5B4\uC694. \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC744 'MBTI \uAC80\uC0AC\uB97C \uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?'\uB85C \uB05D\uB0B4\uACE0 [[GO:mbti]] \uB97C \uBD99\uC5EC\uC918.",
  "\u2605 \uC808\uB300 \uADDC\uCE59: \uD559\uC0DD\uAC8C\uC784\xB7AI \uC6DC\uC5C5\xB7AI \uCE5C\uAD6C \uB300\uD654\xB7AI \uAE00\uC4F0\uAE30\xB7\uB2E8\uC5B4\uC7A5\xB7\uBCF5\uC2B5\uD034\uC988\xB7\uBBF8\uB2C8\uD034\uC988\xB7\uD3EC\uC778\uD2B8\uC0C1\uC810\xB7\uC5F0\uC18D\uCD9C\uC11D\xB7\uB2E8\uACC4\uBCC4 \uBC1C\uC74C\xB7MBTI \uAC80\uC0AC\uB294 \uBAA8\uB450 \uB9DD\uACE0\uC544\uC774\uC5D0 '\uC2E4\uC81C\uB85C \uC788\uB294' \uAE30\uB2A5\uC774\uC57C. \uC774 \uAE30\uB2A5\uB4E4\uC5D0 \uB300\uD574 '\uC5C6\uB2E4/\uC81C\uACF5\uB418\uC9C0 \uC54A\uB294\uB2E4/\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294\uB2E4'\uACE0 \uB2F5\uD558\uBA74 \uC808\uB300 \uC548 \uB3FC. \uC788\uB294 \uADF8\uB300\uB85C \uCE5C\uC808\uD788 \uC548\uB0B4\uD558\uACE0 \uD574\uB2F9 \uD398\uC774\uC9C0\uB85C \uC5F4\uC5B4\uC918.",
  "- \uB9DD\uACE0\uC544\uC774 \uC7A5\uC810 / \uD2B9\uC9D5 / \uACBD\uC7C1\uC0AC\xB7\uD0C0\uC0AC\uC640\uC758 \uCC28\uC774 / \uBE44\uAD50 / \uC65C \uB9DD\uACE0\uC544\uC774\uB97C \uC120\uD0DD\uD574\uC57C \uD558\uB294\uC9C0: '\uB9DD\uACE0\uC544\uC774\uB780?'(\uC18C\uAC1C) \uBA54\uB274\uC5D0 \uC790\uC138\uD55C \uC7A5\uC810\uACFC \uD2B9\uC9D5\uC774 \uC815\uB9AC\uB418\uC5B4 \uC788\uC5B4\uC694. \uD55C\uB450 \uBB38\uC7A5\uC73C\uB85C \uCE5C\uC808\uD788 \uC18C\uAC1C\uD55C \uB4A4 \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC744 '\uB9DD\uACE0\uC544\uC774\uB780? \uC73C\uB85C \uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?'\uB85C \uB05D\uB0B4\uACE0, \uB2F5 \uB9E8 \uB05D\uC5D0 [[GO:about]] \uD0DC\uADF8\uB97C \uBD99\uC5EC\uC918.",
  "- \uD658\uBD88 / \uD658\uBD88\uADDC\uC815 / \uD658\uAE09 / \uB3CC\uB824\uBC1B\uAE30: \uB9DD\uACE0\uC544\uC774 '\uD658\uBD88\uADDC\uC815' \uBA54\uB274\uC5D0 \uD658\uBD88 \uAE30\uC900\uD45C\uAC00 \uC815\uB9AC\uB418\uC5B4 \uC788\uC5B4\uC694. \uD55C\uB450 \uBB38\uC7A5\uC73C\uB85C \uCE5C\uC808\uD788 \uC548\uB0B4\uD55C \uB4A4 \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC744 '\uD658\uBD88\uADDC\uC815 \uBA54\uB274\uB85C \uC5F0\uACB0\uD574 \uB4DC\uB9B4\uAE4C\uC694?'\uB85C \uB05D\uB0B4\uACE0, \uB2F5 \uB9E8 \uB05D\uC5D0 [[GO:refund]] \uD0DC\uADF8\uB97C \uBD99\uC5EC\uC918. (\uD658\uBD88\uC744 '\uC218\uAC15\uB8CC/\uACB0\uC81C'\uB85C \uC548\uB0B4\uD558\uC9C0 \uB9C8.)",
  "\uC704 \uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uBA54\uB274 \uC704\uCE58\uB97C \uBB3C\uC5B4\uBCF4\uBA74 \uCD94\uCE21\uD574\uC11C \uB2F5\uD558\uC9C0 \uB9D0\uACE0, '\uC815\uD655\uD55C \uC704\uCE58\uB97C \uD655\uC778\uD55C \uB4A4 \uC548\uB0B4\uB4DC\uB9B4\uAC8C\uC694' \uB77C\uACE0 \uD558\uAC70\uB098 \uD558\uB2E8 \uCE74\uD1A1 \uC0C1\uB2F4 \uC5F0\uACB0\uC744 \uAD8C\uD574\uC918.",
  "[\uD398\uC774\uC9C0 \uBC14\uB85C \uC5F4\uAE30 \uAE30\uB2A5] \uC9C8\uBB38\uC774 \uC544\uB798 \uCF54\uB4DC \uBAA9\uB85D\uC758 \uBA54\uB274\uC640 \uAD00\uB828 \uC788\uC73C\uBA74, \uC9E7\uAC8C \uC548\uB0B4\uD55C \uB4A4 \uB9C8\uC9C0\uB9C9 \uBB38\uC7A5\uC73C\uB85C '\u25CB\u25CB \uD398\uC774\uC9C0\uB97C \uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?'\uB77C\uACE0 \uBB3C\uC5B4\uBD10. \uADF8\uB9AC\uACE0 \uB2F5\uBCC0\uC758 \uB9E8 \uB05D(\uB9C8\uCE68\uD45C \uB4A4)\uC5D0 \uC0AC\uC6A9\uC790\uC5D0\uAC8C \uBCF4\uC774\uC9C0 \uC54A\uB294 \uD0DC\uADF8 [[GO:\uCF54\uB4DC]] \uB97C \uC815\uD655\uD788 \uD55C \uAC1C\uB9CC \uBD99\uC5EC\uC918. \uD0DC\uADF8\uB294 \uC124\uBA85\uD558\uC9C0 \uB9D0\uACE0 \uADF8\uB0E5 \uBD99\uC774\uAE30\uB9CC \uD574.",
  "\uCF54\uB4DC \uBAA9\uB85D(\uCF54\uB4DC=\uBB34\uC5C7): lesson-enter(\uC218\uC5C5 \uC785\uC7A5=\uC9C0\uAE08 \uD654\uC0C1\uC218\uC5C5 \uB85C\uBE44\uB85C \uB4E4\uC5B4\uAC00\uAE30), lesson-change(\uC218\uC5C5 \uC5F0\uAE30/\uBCC0\uACBD=\uC77C\uC815 \uBC14\uAFB8\uAE30), leveltest(\uB808\uBCA8\uD14C\uC2A4\uD2B8), booking(\uC218\uC5C5 \uC2E0\uCCAD/\uC608\uC57D), precheck(\uC218\uC5C5 \uC9C4\uB2E8), library(\uAD50\uC7AC/\uC218\uC5C5 \uC790\uB8CC/\uC790\uB8CC\uC2E4), report(\uD3C9\uAC00\uD45C/\uC131\uC801\uD45C), mypage(\uB9C8\uC774\uD398\uC774\uC9C0/\uD559\uC0DD \uB300\uC2DC\uBCF4\uB4DC), parent-dashboard(\uD559\uBD80\uBAA8 \uB300\uC2DC\uBCF4\uB4DC), payment(\uACB0\uC81C/\uC218\uAC15\uAD8C), teachers(\uAD50\uC0AC/\uC120\uC0DD\uB2D8 \uC18C\uAC1C), games(\uD559\uC0DD\uAC8C\uC784=\uC624\uB298 \uBC30\uC6B4 \uB0B4\uC6A9\uC73C\uB85C \uD558\uB294 \uC601\uC5B4 \uBBF8\uB2C8\uAC8C\uC784 \uBAA8\uC74C), warmup(\uC218\uC5C5 \uC804 AI \uC6DC\uC5C5/\uC608\uC2B5), ai-friend(AI \uCE5C\uAD6C \uB300\uD654/\uC601\uC5B4 \uD68C\uD654 \uC5F0\uC2B5), ai-write(AI \uAE00\uC4F0\uAE30/\uC601\uC791 \uCCA8\uC0AD), review-quiz(\uBCF5\uC2B5\uD034\uC988), microquiz(\uBBF8\uB2C8\uD034\uC988), vocab(\uB2E8\uC5B4\uC7A5), points-shop(\uD3EC\uC778\uD2B8\uC0C1\uC810), mypoints(\uB0B4 \uD3EC\uC778\uD2B8), streak(\uC5F0\uC18D\uCD9C\uC11D), checkin(\uCD9C\uC11D\uCCB4\uD06C), speech(\uB2E8\uACC4\uBCC4 \uBC1C\uC74C), speech-coach(\uBC1C\uC74C \uCF54\uCE58), mbti(MBTI \uAC80\uC0AC), admin(\uAD00\uB9AC\uC790 \uD398\uC774\uC9C0), notice(\uACF5\uC9C0\uC0AC\uD56D), faq(\uC790\uC8FC \uBB3B\uB294 \uC9C8\uBB38), event(\uC774\uBCA4\uD2B8), recordings(\uB179\uD654\uBCF8/\uB2E4\uC2DC\uBCF4\uAE30), curriculum(\uCEE4\uB9AC\uD058\uB7FC/\uAD50\uC721\uACFC\uC815), trial(\uBB34\uB8CC\uCCB4\uD5D8), enroll(\uC218\uAC15 \uB4F1\uB85D), contact(\uACE0\uAC1D\uC13C\uD130/\uBB38\uC758), inquiry(\uC2E0\uADDC\uC0C1\uB2F4), reviews(\uC218\uAC15 \uD6C4\uAE30), about(\uB9DD\uACE0\uC544\uC774 \uC18C\uAC1C), goals(\uD559\uC2B5 \uBAA9\uD45C), leaderboard(\uB9AC\uB354\uBCF4\uB4DC/\uC21C\uC704), write(AI \uC791\uBB38), remote(\uC6D0\uACA9 \uC9C0\uC6D0), installguide(\uC124\uCE58 \uAC00\uC774\uB4DC), franchise(\uAC00\uB9F9 \uBB38\uC758), callcenter(\uCF5C\uC13C\uD130), videolesson(\uD654\uC0C1\uC218\uC5C5), focus(\uC9D1\uC911\uB3C4 \uCE21\uC815), teacher-praise(\uCE6D\uCC2C \uC2A4\uD2F0\uCEE4), diagnosis(\uC790\uAC00\uC9C4\uB2E8), all-menu(\uC804\uCCB4\uBA54\uB274).",
  "\u2605 \uB9E4\uC6B0 \uC911\uC694: '\uC218\uC5C5 \uC785\uC7A5/\uC218\uC5C5 \uB4E4\uC5B4\uAC00\uAE30'\uB294 \uBC18\uB4DC\uC2DC lesson-enter \uB2E4. '\uC218\uC5C5 \uC5F0\uAE30/\uBCC0\uACBD/\uCDE8\uC18C'\uB294 lesson-change \uB2E4. \uC774 \uB458\uC744 \uC808\uB300 \uBC14\uAFD4 \uC4F0\uC9C0 \uB9C8.",
  "\uC774 \uBAA9\uB85D\uC5D0 \uC5C6\uB294 \uC8FC\uC81C\uBA74 '\uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?'\uB3C4, \uD0DC\uADF8\uB3C4 \uC808\uB300 \uBD99\uC774\uC9C0 \uB9C8. \uD55C \uB2F5\uBCC0\uC5D0 \uD0DC\uADF8\uB294 \uCD5C\uB300 \uD55C \uAC1C."
].join("\n");
PERSONA_STUDENT += "\n★ 답변 형식(목록에 있는 메뉴·기능 질문에는 예외 없이 지켜): ① 그 기능이 무엇을·어디서·어떻게 도와주는지 학생·학부모가 바로 이해되게 2~4문장으로 구체적이고 친절하게 설명해. 뭉뚱그리지 말고 실제로 무엇을 할 수 있는지 하나하나 알려줘. ② 반드시 마지막 문장을 그 메뉴 이름을 넣은 '○○ 페이지를 열어드릴까요?' 형태의 정중한 질문으로 끝내. ③ 답 맨 끝(마침표 뒤)에 그 메뉴의 [[GO:코드]] 태그를 정확히 한 개 붙여. 학생이 이어서 '네/응/열어줘'라고 하면 그 페이지가 열리니, 매 답변마다 이 형식을 꼭 지켜.";
PERSONA_STUDENT += "\n[망고아이 지식 — 낯가림·타사 비교·왕초보 가능여부·효과·성향·레벨 고민처럼 복잡하거나 돌려 말한 질문도 아래 '사실'로 추론해서 요점을 짚어 따뜻하게 답해. 특정 금액·나이·시간·보장은 절대 지어내지 마.\n· 정체성: 검증된 원어민의 1:1·1:2 화상영어 수업 + A.I 학습관리를 합친 서비스(수업은 원어민이, 예습·복습·평가·발음교정·리포트는 A.I). 20년 전통, 국내 최초 화상영어. 영어 외에 중국어 수업도 운영합니다(중국어 강선생님 담당).\n· 선생님: 매번 바뀌는 랜덤 매칭이 아니라 같은 선생님이 전담해 아이 성향·약점을 꾸준히 파악·관리. 1:1 또는 1:2 소수정예.\n· 센터: 외주가 아니라 망고아이가 직접 운영하는 필리핀 현지 센터(전용 인터넷·장비, 정규직 원어민)라 거품 없는 합리적 수강료.\n· 대상·레벨: 유아부터 성인까지. CEFR 단계별 커리큘럼+연령·레벨 맞춤 자체 교재. 무료 레벨테스트로 진단해 왕초보도 딱 맞는 단계부터 부담 없이 시작.\n· 성향 배려: 낯을 가리거나 내성적인 아이일수록 1:1 전담이 잘 맞아 빨리 편해지고, 흥미있는 실생활 주제로 스스로 말하게 이끔.\n· A.I 학습관리: 매 수업 후 A.I 평가서 자동 생성+배운 내용 기반 10문항 복습 퀴즈, 월간 리포트, 수업 외 시간 A.I 발음코치 무제한 말하기 연습, A.I 영어친구 대화·A.I 영작 첨삭.\n· 학부모: 출결·평가·진도·공지를 카카오톡으로 실시간 전송.\n· 편의: PC·태블릿·휴대폰 어디서나 입장, 원하는 시간대 예약·연기·변경 가능.\n· 다른 화상영어와 차별점: ①직영 센터 ②전담 선생님제 ③수업+A.I 학습관리 결합 ④20년 전통 국내 최초.\n· 수강료·환불: 직영이라 합리적(1:2는 1인당 더 저렴). 정확한 금액·환불 규정은 숫자를 말하지 말고 수강료/상담 메뉴로 안내. 복잡한 상담 질문엔 먼저 2~4문장으로 핵심을 답한 뒤, 관련 메뉴가 있으면 형식대로 '○○ 열어드릴까요?'+[[GO:코드]]로 안내해.]";
var PERSONA_STUDENT_EN = [
  "You are Mangoi's friendly, warm AI assistant. Always reply politely in natural English, in a simple, kind tone that both children and parents can easily understand, in 2-4 short sentences. Reply in English only.",
  "[Screen guidance \u2014 only state the facts listed below; never invent menu/button locations or steps not in this list.]",
  "- Enter class: tap the button at the bottom-right to enter the native teacher's room.",
  "- Payment / buy passes: tap the yellow button at the bottom-left.",
  "- Report card / evaluation: open the left sidebar menu and tap 'Report (grades)'. (It's the left sidebar's report, not the top-right profile.)",
  "- Timetable / attendance: open 'My Page' from the left menu (or after login).",
  "- Textbooks / class materials / library: see the 'Library' menu. Homework is in 'My Page'.",
  "- Postpone a class: open the left menu and tap 'Postpone' (postpone/change). It must be done at least 30 minutes before class starts.",
  "- Change a class: open the left menu and tap 'Change' (postpone/change).",
  "- Edit member info / change password: use the login area at the top-right or 'My Page' in the left menu.",
  "- Level test / placement: apply from 'Level Test' in the left menu. It combines a 1:1 teacher evaluation and AI auto-diagnosis; pick a date and time to book.",
  "- Student games / English games / word games / shooting game: 'Student Game' in the left menu has 7 mini-games (shooter, word battle, etc.) that review today's words and sentences, in English and Chinese. End with 'Would you like me to open the Student Game page?' and append [[GO:games]].",
  "- Pre-class AI warm-up / preview: 'Pre-class AI Warm-up' lets students rehearse today's material with AI. End with 'Would you like me to open the AI Warm-up?' and append [[GO:warmup]].",
  "- AI friend chat / speaking practice: 'AI Friend Chat' lets students talk freely with an AI friend in English. End with 'Would you like me to open AI Friend Chat?' and append [[GO:ai-friend]].",
  "- AI writing / composition feedback: 'AI Writing' corrects the student's English sentences. End with 'Would you like me to open AI Writing?' and append [[GO:ai-write]].",
  "- Vocabulary [[GO:vocab]], Review quiz [[GO:review-quiz]], Mini quiz [[GO:microquiz]], Point shop [[GO:points-shop]], Attendance streak [[GO:streak]], Pronunciation [[GO:speech]] are all real Mangoi features.",
  "IMPORTANT: Student games, AI warm-up, AI friend chat, AI writing, vocabulary, review/mini quiz, point shop, attendance streak and pronunciation ARE real features. Never say they don't exist.",
  "- Refund / refund policy / money back: the 'Refund Policy' menu has the full refund schedule. Give a short, kind answer, end with 'Would you like me to open the Refund Policy page?', and append [[GO:refund]]. (Never route refunds to 'payment'.)",
  "If asked about a location not in this list, don't guess \u2014 say 'Let me check the exact location,' or suggest the bottom KakaoTalk consult.",
  "[Open-page feature] If the question relates to a menu in the code list below, give a short answer, then as the last sentence ask 'Would you like me to open the \u25CB\u25CB page?' and append exactly one hidden tag [[GO:code]] at the very end. Do not explain the tag; just append it.",
  "Code list: lesson-enter (enter class = live class lobby now), lesson-change (postpone/change a class), leveltest, booking, precheck, library, report, mypage, payment, teachers, games (student games), warmup (pre-class AI warm-up), ai-friend (AI friend chat), ai-write (AI writing), review-quiz, microquiz, vocab, points-shop, streak, speech, all-menu.",
  "Very important: 'enter class' is always lesson-enter; 'postpone/change/cancel a class' is lesson-change. Never swap these.",
  "If the topic isn't in the list, don't ask 'shall I open?' and don't append a tag. At most one tag per reply."
].join("\n");
PERSONA_STUDENT_EN += "\n[Mangoi knowledge — reason over these facts to genuinely answer complex or indirect questions (a shy child, comparison with other services, whether a beginner can keep up, effectiveness, level worries). Never invent specific prices, ages, hours or guarantees: verified native-teacher 1:1/1:2 video English + A.I. learning management (A.I. handles preview/review/evaluation/pronunciation/reports; native teachers teach); a dedicated same-teacher system, not random matching, so a child's traits and weak points are managed consistently; Mangoi's own Philippine center (not outsourced) enabling reasonable fees; ages toddler to adult with a CEFR step-by-step curriculum and custom textbooks, plus a free level test so even absolute beginners start at the right level; shy or introverted kids do especially well in 1:1; after each class an A.I. report + a 10-question review quiz, monthly reports, and unlimited A.I. pronunciation practice outside class; parents get real-time KakaoTalk updates; 20 years, Korea's first video-English company; Chinese lessons are offered as well (Teacher Kang). For pricing/refunds never quote numbers — guide them to consult. Answer the real concern warmly in 2-4 sentences first, then use the menu-open format when a relevant menu exists.]";
var PERSONA_OPS = "\uB108\uB294 \uB9DD\uACE0\uC544\uC774 \uD559\uC6D0\xB7\uC9C0\uC810 \uC6B4\uC601\uC790(\uB9E4\uB2C8\uC800\xB7\uC6D0\uC7A5\xB7\uAD00\uB9AC\uC790)\uB97C \uB3D5\uB294 'AI \uC6B4\uC601 \uBE44\uC11C'\uC57C. \uD56D\uC0C1 \uC815\uC911\uD55C \uC874\uB313\uB9D0(\uD574\uC694\uCCB4\xB7\uD569\uB2C8\uB2E4\uCCB4)\uB85C, \uB9E4\uB2C8\uC800\uAC00 \uBC14\uB85C \uC2E4\uD589\uD560 \uC218 \uC788\uAC8C \uD575\uC2EC\uB9CC \uB610\uB837\uD558\uAC8C, \uD55C\uAD6D\uC5B4\uB85C\uB9CC \uB2F5\uD574\uC918. \uBC18\uB9D0 \uAE08\uC9C0. \uB2F5\uBCC0\uC740 \uBCF4\uD1B5 2~5\uBB38\uC7A5\uC73C\uB85C \uAC04\uACB0\uD558\uAC8C. \uD544\uC694\uD558\uBA74 \uC9E7\uC740 \uB2E8\uACC4(1\xB72\xB73)\uB85C \uC815\uB9AC\uD574\uB3C4 \uC88B\uC544.\n[\uB108\uC758 \uC8FC\uC694 \uC5C5\uBB34]\n1) AI \uD3C9\uAC00\uC11C\xB7\uD559\uC2B5 \uB9AC\uD3EC\uD2B8 \uCD08\uC548: \uD559\uC0DD\uC758 \uCD9C\uACB0\xB7\uC9C4\uB3C4\xB7\uC810\uC218\xB7\uD2B9\uC774\uC0AC\uD56D\uC744 \uBC14\uD0D5\uC73C\uB85C \uD3C9\uAC00\uC11C/\uD559\uC2B5 \uB9AC\uD3EC\uD2B8 \uCD08\uC548\uC744 \uC791\uC131\uD574 \uC8FC\uACE0, \uC5B4\uB5A4 \uC815\uBCF4\uAC00 \uB354 \uD544\uC694\uD55C\uC9C0 \uC9DA\uC5B4\uC918.\n2) \uC2E4\uC2DC\uAC04 \uC774\uC0C1\uAC10\uC9C0 \uB300\uC751: \uCD9C\uC11D \uAE09\uAC10, \uACB0\uC81C \uC2E4\uD328, \uC218\uC5C5 \uBBF8\uC785\uC7A5, \uAC15\uC0AC \uB178\uC1FC, \uBE44\uC815\uC0C1 \uB85C\uADF8\uC778 \uB4F1 \uC6B4\uC601 \uC774\uC0C1 \uC2E0\uD638\uB97C \uC5B4\uB5BB\uAC8C \uD655\uC778\xB7\uB300\uC751\uD560\uC9C0 \uB2E8\uACC4\uB85C \uC548\uB0B4\uD574\uC918.\n3) \uBBF8\uB0A9 \uC54C\uB9BC\xB7\uC815\uC0B0: \uC218\uAC15\uB8CC \uBBF8\uB0A9\uC790 \uC54C\uB9BC \uBB38\uAD6C \uCD08\uC548, \uC9C0\uC810\uBCC4\xB7\uAC15\uC0AC\uBCC4 \uC815\uC0B0 \uD56D\uBAA9 \uC815\uB9AC, \uC815\uC0B0 \uC2DC \uD655\uC778\uD560 \uD56D\uBAA9\uC744 \uC548\uB0B4\uD574\uC918.\n4) \uADF8 \uBC16\uC758 \uC6B4\uC601 \uC9C8\uBB38(\uACF5\uC9C0\xB7\uC77C\uC815\xB7\uC778\uB825\xB7\uBB38\uC758 \uC751\uB300 \uB4F1)\uC5D0\uB3C4 \uC2E4\uBB34\uC801\uC73C\uB85C \uB3C4\uC640\uC918.\n[\uC6A9\uC5B4] '\uD3EC\uC778\uD2B8'\uB294 \uB9DD\uACE0\uC544\uC774\uC758 '\uD559\uC0DD \uD3EC\uC778\uD2B8'(\uC801\uB9BD \uC810\uC218)\uB97C \uB73B\uD574. \uCD9C\uC11D\xB7\uC219\uC81C\xB7\uB808\uBCA8\uC5C5 \uB4F1\uC73C\uB85C \uC801\uB9BD\uB418\uACE0, \uCDA9\uC804\xB7\uCC28\uAC10\uD558\uAC70\uB098 \uAE30\uD504\uD2F0\uCF58\uC73C\uB85C \uAD50\uD658\uD560 \uC218 \uC788\uC5B4. \uAD00\uB9AC\uC790 \uD654\uBA74\uC758 \u300C\u{1F381} \uD3EC\uC778\uD2B8 & \uAE30\uD504\uD2F0\uCF58 \u2192 \u{1F4B0} \uD559\uC0DD \uD3EC\uC778\uD2B8 \uC794\uC561\u300D \uBA54\uB274\uC5D0\uC11C \uD559\uC0DD\uBCC4 \uC794\uC561\xB7\uB204\uC801\uC801\uB9BD\xB7\uB204\uC801\uC0AC\uC6A9\xB7\uCD5C\uADFC \uB0B4\uC5ED\uC744 \uD655\uC778\uD574. '\uD3EC\uC778\uD2B8'\uB97C \uC6B4\uC601\uC0C1\uC758 '\uD575\uC2EC \uD56D\uBAA9/\uC694\uC810' \uAC19\uC740 \uB2E4\uB978 \uB73B\uC73C\uB85C \uD574\uC11D\uD558\uC9C0 \uB9C8.\n[\uC6D0\uCE59] \uBAA8\uB974\uB294 \uC218\uCE58\uB098 \uC2E4\uC81C \uB370\uC774\uD130\uB294 \uC9C0\uC5B4\uB0B4\uC9C0 \uB9C8. \uB370\uC774\uD130\uAC00 \uC5C6\uC73C\uBA74 '\uC5B4\uB5A4 \uAC12\uC744 \uB123\uC73C\uBA74 \uB418\uB294\uC9C0' \uC591\uC2DD\xB7\uC608\uC2DC\uB85C \uBCF4\uC5EC\uC8FC\uACE0, \uD544\uC694\uD55C \uC785\uB825\uC744 \uC694\uCCAD\uD574\uC918. \uAC1C\uC778\uC815\uBCF4\xB7\uAE08\uC561\uC740 \uC2E0\uC911\uD788 \uB2E4\uB8E8\uACE0, \uC678\uBD80\uB85C \uB2E8\uC815\uC801 \uC57D\uC18D\uC744 \uD558\uC9C0 \uB9C8. \uD3C9\uAC00\uC11C/\uC54C\uB9BC \uBB38\uAD6C\uB97C \uB9CC\uB4E4 \uB54C\uB294 \uBC14\uB85C \uBCF5\uC0AC\uD574 \uC4F8 \uC218 \uC788\uAC8C \uC644\uC131\uD615 \uC608\uC2DC \uBB38\uC7A5\uC73C\uB85C \uC81C\uC2DC\uD574\uC918.";
var PERSONA_OPS_EN = "You are Mangoi's 'AI Operations Assistant' that helps academy/branch managers and admins. Always reply politely in natural English, concise and action-oriented, in English only. Usually 2-5 short sentences; you may use short numbered steps when helpful.\n[Your main duties]\n1) AI evaluations & learning report drafts: draft evaluations/learning reports from a student's attendance, progress, scores and notes, and point out what extra info is needed.\n2) Real-time anomaly response: guide step-by-step how to check and respond to operational signals such as attendance drops, failed payments, no-show students/teachers, abnormal logins.\n3) Overdue alerts & settlement: draft overdue-payment notices, organize per-branch/per-teacher settlement items, and list points to verify before settling.\n4) Help with other operational questions (notices, scheduling, staffing, handling inquiries).\n[Term] '\uD3EC\uC778\uD2B8'/'points' means Mangoi's STUDENT points (reward score) \u2014 earned via attendance, homework, level-ups, redeemable for gifticons. Check them under the admin menu \u300C\u{1F381} Points & Gifts \u2192 \u{1F4B0} Student Balances\u300D. Never read 'points' as a generic 'key item'.\n[Principles] Never invent real numbers or data. If data is missing, show the format/example fields to fill in and ask for the needed input. Handle personal data and money carefully and avoid definitive external promises. When drafting evaluations/notices, give ready-to-copy complete example sentences.";
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });
}
__name(json, "json");
async function callAI(message, env, lang, mode, extra) {
  const isEn = lang === "en";
  if (!env.AI) {
    return { answer: isEn ? "Demo mode for now. Set the Workers AI (AI) binding for smart replies!" : "\uC9C0\uAE08\uC740 \uB370\uBAA8 \uBAA8\uB4DC\uC608\uC694. Workers AI \uBC14\uC778\uB529(AI)\uC744 \uC124\uC815\uD558\uBA74 \uB611\uB611\uD558\uAC8C \uB2F5\uD574 \uB4DC\uB824\uC694!" };
  }
  let persona = mode === "ops" ? isEn ? PERSONA_OPS_EN : PERSONA_OPS : isEn ? PERSONA_STUDENT_EN : PERSONA_STUDENT;
  if (extra) persona = persona + "\n\n" + extra;   // \uD83E\uDDED \uB9E4\uCE6D\uB41C \uBA54\uB274\uC758 \uC0AC\uC2E4 \uBE14\uB85D(=\uAD6C\uCCB4 \uC124\uBA85\uC758 \uADFC\uAC70)
  const result = await env.AI.run(AI_MODEL, {
    messages: [
      { role: "system", content: persona },
      { role: "user", content: message }
    ],
    max_tokens: 512,
    temperature: 0.7
  });
  const text = (result && (result.response || result.text || result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) || "").toString().trim();
  return { answer: text || (isEn ? "Sorry, could you say that again?" : "\uC74C, \uB2E4\uC2DC \uD55C \uBC88 \uB9D0\uC500\uD574 \uC8FC\uC2DC\uACA0\uC5B4\uC694?") };
}
__name(callAI, "callAI");
var GO_CODES = ["lesson-enter", "lesson-change", "leveltest", "booking", "precheck", "library", "report", "mypage", "parent-dashboard", "payment", "teachers", "games", "warmup", "ai-friend", "ai-write", "review-quiz", "microquiz", "all-menu", "admin", "notice", "faq", "event", "points-shop", "mypoints", "vocab", "recordings", "curriculum", "trial", "enroll", "contact", "inquiry", "reviews", "streak", "checkin", "mbti", "about", "goals", "leaderboard", "speech", "speech-coach", "write", "remote", "installguide", "franchise", "callcenter", "videolesson", "focus", "teacher-praise", "diagnosis", "refund", "monthly-report"];
function isRefundQuestion(msg) {
  if (!msg) return false;
  if (/refund|money\s*back/i.test(msg)) return true;
  if (msg.indexOf("\uD658\uBD88") >= 0) return true;
  if (msg.indexOf("\uD658\uAE09") >= 0) return true;
  if (msg.indexOf("\uC704\uC57D\uAE08") >= 0) return true;
  if (msg.replace(/\s/g, "").indexOf("\uB3CC\uB824\uBC1B") >= 0) return true;
  return false;
}
__name(isRefundQuestion, "isRefundQuestion");
function isPointsQuestion(msg) {
  if (!msg) return false;
  const KO = ["\uD3EC\uC778\uD2B8", "\uC801\uB9BD", "\uAE30\uD504\uD2F0\uCF58", "\uAE30\uD504\uD2B8\uCF58", "\uCDA9\uC804", "\uCC28\uAC10"];
  for (let i = 0; i < KO.length; i++) {
    if (msg.indexOf(KO[i]) >= 0) return true;
  }
  if (/\bpoints\b|gifticon|reward\s*points?/i.test(msg)) return true;
  return false;
}
__name(isPointsQuestion, "isPointsQuestion");
function isHangulCode(c) {
  return c >= 44032 && c <= 55203;
}
__name(isHangulCode, "isHangulCode");
function isAsciiAlpha(c) {
  return c >= 65 && c <= 90 || c >= 97 && c <= 122;
}
__name(isAsciiAlpha, "isAsciiAlpha");
function extractStudentName(msg) {
  if (!msg) return "";
  const words = msg.split(/[\s,.!?~"'`()\[\]{}…\xB7\-:;/\\]+/).filter(Boolean);
  const stop = ["\uD3EC\uC778\uD2B8", "\uD3EC\uC778\uD2B8\uB294", "\uC810\uC218", "\uC794\uC561", "\uC801\uB9BD", "\uC0AC\uC6A9", "\uCDA9\uC804", "\uCC28\uAC10", "\uAE30\uD504\uD2F0\uCF58", "\uD559\uC0DD", "\uD559\uC0DD\uC758", "\uB2D8", "\uC5BC\uB9C8", "\uC870\uD68C", "\uAC80\uC0C9", "\uBCF4\uC5EC\uC918", "\uC54C\uB824\uC918", "\uC54C\uACE0", "\uC2F6\uC5B4", "\uC2F6\uC5B4\uC694", "\uC880", "\uD604\uC7AC", "\uC9C0\uAE08", "\uC758", "\uC774\uB984", "\uB204\uC801", "\uB0B4\uC5ED", "\uD655\uC778", "\uD574\uC918", "\uC8FC\uC138\uC694", "\uD574\uC8FC\uC138\uC694", "\uBB34\uC5C7", "\uBB50\uC57C", "\uBB50\uC608\uC694", "\uAD50\uD658", "\uAD50\uD658\uD574", "\uBC14\uAFD4", "\uBC14\uAFB8\uAE30", "\uBCC0\uACBD", "\uAD50\uCCB4", "\uBC29\uBC95", "\uC5B4\uB5BB\uAC8C", "\uC5BC\uB9C8\uB098", "\uC0C1\uD488", "\uCFE0\uD3F0", "\uAE30\uD504\uD2B8", "\uC801\uB9BD\uAE08", "\uC0AC\uC6A9\uCC98", "\uBB38\uC758", "\uAD00\uB828", "\uB300\uD574"];
  const TOPIC = ["\uD3EC\uC778\uD2B8", "\uC801\uB9BD", "\uAE30\uD504\uD2F0\uCF58", "\uAE30\uD504\uD2B8\uCF58", "\uAE30\uD504\uD2B8", "\uCDA9\uC804", "\uCC28\uAC10", "\uC810\uC218", "\uC794\uC561"];
  for (const w of words) {
    let topical = false;
    for (let t = 0; t < TOPIC.length; t++) {
      if (w.indexOf(TOPIC[t]) === 0) {
        topical = true;
        break;
      }
    }
    if (topical) continue;
    if (stop.indexOf(w) >= 0) continue;
    if (w.length >= 2 && w.length <= 4) {
      let allHangul = true;
      for (let i = 0; i < w.length; i++) {
        if (!isHangulCode(w.charCodeAt(i))) {
          allHangul = false;
          break;
        }
      }
      if (allHangul) return w;
    }
    if (w.length >= 3 && isAsciiAlpha(w.charCodeAt(0))) {
      let okId = true;
      for (let i = 1; i < w.length; i++) {
        const c = w.charCodeAt(i);
        if (!(isAsciiAlpha(c) || c >= 48 && c <= 57 || c === 95)) {
          okId = false;
          break;
        }
      }
      if (okId) return w;
    }
  }
  return "";
}
__name(extractStudentName, "extractStudentName");
// ══════════════════════════════════════════════════════════════════════
// 🧭 관리자 메뉴 지도 (부모 그룹 → 자식 카드 → 손자 서브메뉴)  2026-07-23
//   목적: AI 운영비서가 한국어/영어 어느 쪽으로 물어도 admin.html 의 실제
//         메뉴를 정확히 찾아가고, "일반론"이 아니라 그 메뉴가 실제로 하는
//         일을 근거로 설명하게 한다.
//   · go   = admin.html 에 실재하는 요소 id (카드 또는 손자 details).
//            adm-s17.js miOpsNavigate() 가 상위 <details> 를 모두 펼치고 스크롤.
//   · g/gEn= 왼쪽 사이드바 부모 그룹명(위치 안내용)
//   · kw   = 한국어 키워드(부분 문자열 매칭)
//   · ekw  = 영어 키워드(단어 경계 매칭 — 'pay' 가 'page' 를 가로채지 않음)
//   · d/dEn= 그 메뉴에서 실제로 할 수 있는 일(LLM 근거 = 구체 설명의 재료)
//   ⚠️ 새 카드 추가 시: 여기 + admin.html 요소 id 가 1:1 이어야 동작.
// ══════════════════════════════════════════════════════════════════════
var OPS_MENUS = [
  // ── 1. 평가서 통합 / Evaluations ──────────────────────────────
  { go: "card-eval-mgmt", g: "평가서 통합", gEn: "Evaluations", ko: "📝 학생 평가서", en: "Student Evaluations",
    kw: ["평가서", "평가표", "성적표", "학생 평가", "평가 작성"], ekw: ["evaluation", "evaluations", "report card", "report cards", "student evaluation", "grades"],
    d: "학생별 평가서를 작성·조회·수정하고 학부모 발송까지 처리합니다. 강사가 올린 평가서 목록과 작성 통계도 여기서 봅니다.",
    dEn: "Write, review and edit each student's evaluation and send it to parents. You can also see the list of evaluations teachers submitted and completion statistics." },
  { go: "sub-eval-create", g: "평가서 통합", gEn: "Evaluations", ko: "➕ 빠른 평가서 작성", en: "Quick Evaluation Form",
    kw: ["평가서 작성", "빠른 평가", "평가 입력"], ekw: ["write evaluation", "create evaluation", "new evaluation", "quick evaluation"],
    d: "학생 이름·점수·코멘트를 넣어 평가서 한 건을 바로 작성하는 입력 폼입니다.",
    dEn: "A form to write one evaluation right away — student, scores and comments." },
  { go: "sub-eval-list", g: "평가서 통합", gEn: "Evaluations", ko: "📋 평가서 목록 + 통계", en: "Evaluation List & Stats",
    kw: ["평가서 목록", "평가 통계", "평가 현황"], ekw: ["evaluation list", "evaluation stats", "evaluation statistics"],
    d: "작성된 평가서 목록과 강사별·기간별 작성 통계를 확인합니다.",
    dEn: "The list of submitted evaluations plus per-teacher and per-period completion stats." },
  { go: "card-bulk-eval", g: "평가서 통합", gEn: "Evaluations", ko: "📚 강사 일괄 평가서 작성", en: "Bulk Evaluation",
    kw: ["일괄 평가", "일괄평가", "벌크 평가", "한번에 평가"], ekw: ["bulk evaluation", "bulk eval", "batch evaluation"],
    d: "한 강사가 맡은 여러 학생의 평가서를 한 화면에서 몰아서 작성합니다.",
    dEn: "Write evaluations for all of one teacher's students in a single screen." },
  { go: "card-ai-lesson-report", g: "평가서 통합", gEn: "Evaluations", ko: "🎙 AI 학습 리포트 (수업 녹음 자동 분석)", en: "AI Learning Report (from class recording)",
    kw: ["ai 학습 리포트", "수업 녹음 분석", "ai 리포트", "녹음 분석"], ekw: ["ai learning report", "ai lesson report", "recording analysis"],
    d: "학생 UID와 수업 녹음을 넣으면 AI가 녹음을 듣고 학습 리포트를 자동으로 써 줍니다(강사 입력 없이).",
    dEn: "Give a student UID and a class recording, and the AI listens to it and writes the learning report by itself — no teacher input needed." },
  { go: "card-ai-eval-draft", g: "평가서 통합", gEn: "Evaluations", ko: "🤖 AI 평가서 자동 작성", en: "AI Evaluation Draft",
    kw: ["ai 평가서", "평가서 초안", "자동 평가서", "평가 초안"], ekw: ["ai evaluation draft", "evaluation draft", "ai draft"],
    d: "강사가 정한 점수와 키워드 3~5개만 넣으면 AI가 평가서 문장을 다듬어 초안을 만들어 줍니다.",
    dEn: "Enter the teacher's scores and 3-5 keywords, and the AI turns them into a polished evaluation draft." },
  { go: "card-monthly-report", g: "평가서 통합", gEn: "Evaluations", ko: "📄 월별 학습 보고서", en: "Monthly Learning Report",
    kw: ["월별 리포트", "월간 리포트", "월별 보고서", "월간 보고서", "학습 보고서"], ekw: ["monthly report", "monthly learning report"],
    d: "한 달치 출결·진도·평가를 묶어 학부모 발송용 월간 학습 보고서를 만듭니다.",
    dEn: "Bundles a month of attendance, progress and evaluations into a monthly report to send to parents." },
  { go: "card-comparison-report", g: "평가서 통합", gEn: "Evaluations", ko: "📊 자녀 성장 비교 리포트", en: "Growth Comparison Report",
    kw: ["비교 리포트", "성장 비교", "자녀 성장"], ekw: ["comparison report", "growth report", "growth comparison"],
    d: "같은 학생의 이전 기간 대비 성장, 또래 평균 대비 위치를 그래프로 비교해 보여줍니다.",
    dEn: "Compares a student's growth against their own past periods and the peer average, as charts." },

  // ── 2. 알림 센터 / Notification Center ─────────────────────────
  { go: "card-kakao-mgmt", g: "알림 센터", gEn: "Notification Center", ko: "📲 카카오 알림톡", en: "Kakao Alimtalk",
    kw: ["알림톡", "카카오", "카톡 발송", "카톡 알림"], ekw: ["kakao", "alimtalk", "kakaotalk"],
    d: "학부모에게 나가는 카카오 알림톡 템플릿·발송 내역·API 연동 상태를 관리하고, 학부모 답장(양방향)도 받습니다.",
    dEn: "Manage the KakaoTalk alimtalk templates sent to parents, the send history and the API connection status — including inbound parent replies." },
  { go: "sub-kakao-inbound", g: "알림 센터", gEn: "Notification Center", ko: "📨 학부모 답장 수신", en: "Parent Replies (inbound)",
    kw: ["학부모 답장", "답장 수신", "양방향 카톡"], ekw: ["parent reply", "parent replies", "inbound message"],
    d: "학부모가 알림톡에 보낸 답장을 모아 보고 응대합니다.",
    dEn: "Collects and lets you respond to parents' replies to alimtalk messages." },
  { go: "card-webpush-mgmt", g: "알림 센터", gEn: "Notification Center", ko: "🔔 Web Push 푸시 알림", en: "Web Push",
    kw: ["웹푸시", "웹 푸시", "푸시 알림", "푸시"], ekw: ["web push", "webpush", "push notification", "push"],
    d: "브라우저·앱 푸시 알림을 작성해 학생·학부모에게 보내고 구독자 수를 확인합니다.",
    dEn: "Compose and send browser/app push notifications to students and parents, and check subscriber counts." },
  { go: "card-poster-maker", g: "알림 센터", gEn: "Notification Center", ko: "📢 공지 스튜디오", en: "Notice Studio",
    kw: ["공지 스튜디오", "포스터", "공지 만들", "공지 제작"], ekw: ["notice studio", "poster maker", "make a notice", "create notice"],
    d: "공지·행사 포스터 이미지를 만들고 팝업/게시판으로 내보냅니다.",
    dEn: "Design notice and event poster images, then publish them as popups or board posts." },
  { go: "card-popups-mgmt", g: "알림 센터", gEn: "Notification Center", ko: "📢 팝업 게시", en: "Popup Publishing",
    kw: ["팝업", "팝업 게시", "팝업 목록"], ekw: ["popup", "popups", "pop-up"],
    d: "홈 화면에 뜨는 팝업을 등록·게시·종료하고 노출 기간과 대상을 정합니다.",
    dEn: "Register, publish and end the popups shown on the home screen, with display period and audience." },
  { go: "card-notice-board", g: "알림 센터", gEn: "Notification Center", ko: "📌 공지사항 게시판", en: "Notice Board",
    kw: ["공지사항", "게시판", "공지글"], ekw: ["notice board", "announcement", "announcements", "bulletin board"],
    d: "학생·학부모·강사가 보는 공지사항 글을 쓰고 상단 고정·수정·삭제합니다.",
    dEn: "Write, pin, edit and delete the notices students, parents and teachers see." },
  { go: "card-notifications", g: "알림 센터", gEn: "Notification Center", ko: "📣 알림 큐 (운영 이벤트)", en: "Notification Queue",
    kw: ["알림 큐", "알림큐", "이벤트 알림", "발송 대기"], ekw: ["notification queue", "event notification", "notification log"],
    d: "시스템이 자동 생성한 운영 알림(발송 대기·성공·실패)을 한 줄씩 확인합니다.",
    dEn: "Shows the operational notifications the system generated — queued, sent and failed — line by line." },

  // ── 3. 강사 통합 / Teachers ────────────────────────────────────
  { go: "card-teacher-mgmt", g: "강사 통합", gEn: "Teachers", ko: "🧑‍🏫 강사관리", en: "Teacher Management",
    kw: ["강사관리", "강사 관리", "강사 목록", "강사 명부", "선생님 관리", "교사 관리", "강사 등록", "강사 정보"], ekw: ["teacher", "teachers", "teacher management", "teacher list", "instructor", "instructors", "faculty"],
    d: "강사 명부(재직·소속·지역·연락처·사진)를 조회하고, 강사 추가·정보 수정·비밀번호 재설정을 합니다.",
    dEn: "Browse the teacher roster (status, group, workplace, region, contact, photo) and add teachers, edit their details or reset their password." },
  { go: "sub-teacher-roster", g: "강사 통합", gEn: "Teachers", ko: "👩‍🏫 강사 명부 (실데이터)", en: "Teacher Roster",
    kw: ["강사 명부", "강사명부", "재직 강사"], ekw: ["teacher roster", "roster"],
    d: "실제 재직 중인 강사 명부 원장입니다.",
    dEn: "The live roster of currently active teachers." },
  { go: "sub-staff-roster", g: "강사 통합", gEn: "Teachers", ko: "🧑‍💼 직원 명부", en: "Staff Roster",
    kw: ["직원 명부", "직원명부", "본사 직원"], ekw: ["staff roster", "staff list", "employees"],
    d: "본사·지사 직원 명부를 확인합니다.",
    dEn: "The roster of HQ and branch staff." },
  { go: "sub-teacher-quality", g: "강사 통합", gEn: "Teachers", ko: "⭐ 강사 평가·품질", en: "Teacher Quality",
    kw: ["강사 평가", "강사 품질", "강사 후기"], ekw: ["teacher quality", "teacher rating", "teacher review"],
    d: "학생 평가·후기를 강사별로 모아 수업 품질을 봅니다.",
    dEn: "Aggregates student ratings and reviews per teacher to show class quality." },
  { go: "sub-auto-sub", g: "강사 통합", gEn: "Teachers", ko: "🔄 결석 강사 자동 대체", en: "Auto Substitute Teacher",
    kw: ["대체 강사", "강사 대체", "결석 강사", "자동 대체"], ekw: ["substitute", "substitute teacher", "auto substitute", "replacement teacher"],
    d: "강사가 결근하면 AI가 조건이 맞는 대체 강사를 자동으로 찾아 매칭합니다.",
    dEn: "When a teacher is absent, the AI finds and matches a suitable substitute automatically." },
  { go: "card-payroll", g: "강사 통합", gEn: "Teachers", ko: "💼 강사 급여·평가 대시보드", en: "Teacher Payroll Dashboard",
    kw: ["급여", "월급", "페이롤", "강사료", "급여 정산", "임금"], ekw: ["payroll", "salary", "wage", "wages", "pay slip", "payslip"],
    d: "강사별 수업 수·급여액·평가를 한 화면에서 보고 급여 명세를 확정합니다.",
    dEn: "See each teacher's class count, pay amount and evaluation in one screen, and finalize the payslip." },
  { go: "card-payroll-auto", g: "강사 통합", gEn: "Teachers", ko: "💼 강사 급여 자동 정산", en: "Automatic Payroll",
    kw: ["자동 급여", "급여 자동", "자동 정산"], ekw: ["automatic payroll", "auto payroll", "payroll automation"],
    d: "출결·수업 기록을 근거로 급여를 자동 계산하고 검증 항목을 표시합니다.",
    dEn: "Calculates pay automatically from attendance and class records, and flags the items to verify." },
  { go: "card-schedule-requests", g: "강사 통합", gEn: "Teachers", ko: "📅 수업 연기·변경 요청", en: "Postpone / Change Requests",
    kw: ["연기 요청", "변경 요청", "일정 변경 요청", "수업 연기 신청"], ekw: ["postpone request", "change request", "reschedule request"],
    d: "강사·학부모가 올린 수업 연기·변경 요청을 승인하거나 반려합니다.",
    dEn: "Approve or reject the postpone/change requests submitted by teachers and parents." },
  { go: "card-class-audit", g: "강사 통합", gEn: "Teachers", ko: "📜 수업 변경 이력", en: "Class Change History",
    kw: ["변경 이력", "수업 이력", "연기 이력", "감사 로그"], ekw: ["change history", "class history", "audit log", "audit trail"],
    d: "수업 연기·삭제·종료가 누가 언제 왜 일어났는지 이력으로 남깁니다.",
    dEn: "The audit trail of who postponed, deleted or ended a class, when and why." },
  { go: "card-vc-quality", g: "강사 통합", gEn: "Teachers", ko: "📶 강사 회선품질", en: "Teacher Connection Quality",
    kw: ["회선품질", "회선 품질", "인터넷 품질", "네트워크 품질"], ekw: ["connection quality", "network quality", "line quality", "bandwidth"],
    d: "화상수업 중 강사 인터넷 품질(끊김·지연)을 강사별로 확인합니다.",
    dEn: "Shows each teacher's internet quality during video classes — drops and latency." },
  { go: "card-class-ratings", g: "강사 통합", gEn: "Teachers", ko: "⭐ 학생 수업 평가", en: "Class Ratings",
    kw: ["수업 만족도", "만족도", "별점", "수업 평가", "별 평가"], ekw: ["class rating", "class ratings", "satisfaction", "star rating"],
    d: "학생이 수업 직후 남긴 별 7개 평가와 코멘트를 강사별로 집계합니다.",
    dEn: "Aggregates the 7-star ratings and comments students leave right after class, per teacher." },
  { go: "card-mbti-mgmt", g: "강사 통합", gEn: "Teachers", ko: "🧠 강사 MBTI (매칭용)", en: "Teacher MBTI",
    kw: ["mbti", "엠비티아이", "성격유형", "성향 매칭", "매칭 프로필"], ekw: ["mbti", "personality type", "matching profile"],
    d: "강사 MBTI·성향을 등록해 학생과의 성향 매칭에 씁니다.",
    dEn: "Register each teacher's MBTI and traits, used for student-teacher personality matching." },
  { go: "card-praise-stats", g: "강사 통합", gEn: "Teachers", ko: "🌟 교사 칭찬 통계", en: "Praise Statistics",
    kw: ["칭찬 통계", "칭찬 현황", "칭찬 스티커"], ekw: ["praise", "praise stats", "praise statistics", "sticker"],
    d: "강사가 학생에게 준 칭찬 스티커를 익명으로 집계해 보여줍니다.",
    dEn: "Anonymously aggregates the praise stickers teachers gave to students." },
  { go: "card-supervisor", g: "강사 통합", gEn: "Teachers", ko: "🎯 강사 슈퍼바이저 모드", en: "Teacher Supervisor",
    kw: ["슈퍼바이저", "수퍼바이저"], ekw: ["supervisor", "supervision"],
    d: "슈퍼바이저가 담당 강사들의 수업·지표를 묶어서 관리합니다.",
    dEn: "Lets a supervisor manage the classes and metrics of the teachers they oversee." },
  { go: "card-room-invite", g: "강사 통합", gEn: "Teachers", ko: "🔐 화상강의실 초대 관리", en: "Classroom Invite",
    kw: ["강의실 초대", "방 초대", "입장 링크", "초대 링크"], ekw: ["room invite", "classroom invite", "invite link", "join link"],
    d: "화상강의실 입장용 초대 링크(JWT)를 발급·회수합니다.",
    dEn: "Issue and revoke JWT invite links for entering the video classroom." },
  { go: "card-timetable", g: "강사 통합", gEn: "Teachers", ko: "🗓 통합 시간표", en: "Unified Timetable",
    kw: ["시간표", "타임테이블", "수업 일정", "스케줄"], ekw: ["timetable", "schedule", "class schedule", "time table"],
    d: "전체 수업 시간표를 한눈에 보고, 수업 연기·변경·이동을 처리합니다.",
    dEn: "See the whole class timetable at a glance and postpone, change or move classes." },
  { go: "card-lesson-log", g: "강사 통합", gEn: "Teachers", ko: "📝 수업 일지", en: "Class Log",
    kw: ["수업 일지", "수업일지"], ekw: ["class log", "lesson log", "class journal"],
    d: "강사가 수업마다 남긴 진도·특이사항 일지를 확인합니다.",
    dEn: "Read the per-class log teachers write — progress covered and anything notable." },
  { go: "card-report-forms", g: "강사 통합", gEn: "Teachers", ko: "📋 보고서 양식 관리", en: "Report Forms",
    kw: ["보고서 양식", "양식 관리", "리포트 양식"], ekw: ["report form", "report forms", "form template"],
    d: "강사·직원이 쓰는 보고서 양식을 만들고 배포합니다.",
    dEn: "Create and distribute the report templates teachers and staff fill in." },
  { go: "card-bug-reports", g: "강사 통합", gEn: "Teachers", ko: "🐞 버그·피드백 접수함", en: "Bug & Feedback Inbox",
    kw: ["버그", "오류 신고", "피드백 접수", "불편 신고"], ekw: ["bug", "bug report", "feedback inbox", "issue report"],
    d: "강사·직원이 신고한 오류와 개선 의견을 모아 처리 상태를 관리합니다.",
    dEn: "Collects the bugs and improvement ideas teachers and staff report, with status tracking." },

  // ── 4. 통계 / KPI ──────────────────────────────────────────────
  { go: "card-kpi-dashboard", g: "통계 / KPI", gEn: "Stats / KPI", ko: "📊 운영 대시보드 KPI", en: "Operations KPI Dashboard",
    kw: ["kpi", "대시보드", "운영 현황", "핵심 지표"], ekw: ["kpi", "dashboard", "key metrics", "overview"],
    d: "매출·학생수·출석률·이탈 등 핵심 운영 지표를 타일로 모아 봅니다.",
    dEn: "The core operating metrics — revenue, student count, attendance rate, churn — gathered as KPI tiles." },
  { go: "card-daily-charts", g: "통계 / KPI", gEn: "Stats / KPI", ko: "📅 일자별 차트", en: "Daily Charts",
    kw: ["일자별 차트", "일별 차트", "매출 차트", "추이 차트"], ekw: ["daily chart", "daily charts", "revenue chart", "trend chart"],
    d: "날짜별 출석·보상·매출·학생 수 추이를 그래프로 봅니다.",
    dEn: "Day-by-day trends of attendance, rewards, revenue and student count as charts." },
  { go: "card-rankings", g: "통계 / KPI", gEn: "Stats / KPI", ko: "🏆 학생 랭킹", en: "Student Rankings",
    kw: ["랭킹", "순위", "발화량", "집중도 순위"], ekw: ["ranking", "rankings", "leaderboard", "top students"],
    d: "학생별 발화량·시선·집중도를 기준으로 순위를 매겨 보여줍니다.",
    dEn: "Ranks students by speaking volume, gaze and focus during class." },
  { go: "card-retention-risk", g: "통계 / KPI", gEn: "Stats / KPI", ko: "🚨 학생 이탈 위험 (AI)", en: "Churn Risk (AI)",
    kw: ["이탈 위험", "이탈위험", "리텐션", "해지 위험", "그만둘"], ekw: ["churn", "churn risk", "retention", "at risk", "dropout risk"],
    d: "출결·참여·결제 신호로 그만둘 위험이 높은 학생을 AI가 자동 감지해 목록화합니다.",
    dEn: "The AI flags students likely to quit — from attendance, engagement and payment signals — as a worklist." },
  { go: "card-retention", g: "통계 / KPI", gEn: "Stats / KPI", ko: "🗑 보관기간 자동 파기", en: "Data Retention Purge",
    kw: ["보관기간", "자동 파기", "데이터 파기"], ekw: ["retention period", "data purge", "auto delete"],
    d: "보관기간이 지난 개인정보·녹화를 규정대로 파기합니다.",
    dEn: "Purges personal data and recordings past their retention period, per policy." },
  { go: "card-active-rooms", g: "통계 / KPI", gEn: "Stats / KPI", ko: "🔴 실시간 수업 현황", en: "Live Classes",
    kw: ["실시간 수업", "활성 룸", "지금 수업", "진행 중인 수업"], ekw: ["live class", "live classes", "active room", "active rooms", "ongoing class"],
    d: "지금 열려 있는 화상수업 방과 참여 인원을 실시간으로 봅니다.",
    dEn: "Shows the video-class rooms open right now and who is in them, in real time." },
  { go: "card-no-shows", g: "통계 / KPI", gEn: "Stats / KPI", ko: "📵 노쇼 리포트", en: "No-show Report",
    kw: ["노쇼", "미입장", "무단 결석"], ekw: ["no show", "no-show", "did not join", "absent without notice"],
    d: "수업에 입장하지 않은 학생·강사를 모아 노쇼 리포트로 보여줍니다.",
    dEn: "Collects students and teachers who never entered the class, as a no-show report." },
  { go: "card-nps-monthly", g: "통계 / KPI", gEn: "Stats / KPI", ko: "🌟 월간 NPS 설문", en: "Monthly NPS",
    kw: ["nps", "추천 지수", "만족도 설문"], ekw: ["nps", "net promoter", "satisfaction survey"],
    d: "월간 NPS(학원 추천 지수) 설문을 발송하고 -100~+100 점수를 집계합니다.",
    dEn: "Sends the monthly NPS survey and aggregates the -100 to +100 score." },
  { go: "card-ai-forecast", g: "통계 / KPI", gEn: "Stats / KPI", ko: "🔮 AI 매출·이탈 예측", en: "AI Forecast",
    kw: ["예측", "전망", "매출 예측", "이탈 예측"], ekw: ["forecast", "prediction", "projection", "revenue forecast"],
    d: "과거 데이터를 근거로 다음 달 매출과 이탈 규모를 AI가 예측합니다.",
    dEn: "The AI projects next month's revenue and churn from historical data." },
  { go: "card-voice-stats", g: "통계 / KPI", gEn: "Stats / KPI", ko: "🎙 음성 코칭 진도", en: "Voice Coaching Stats",
    kw: ["음성 통계", "음성 코칭 진도", "발화 통계"], ekw: ["voice stats", "voice coaching", "speaking stats"],
    d: "전체 학생의 AI 음성 코칭 진도와 발화 기록을 집계합니다.",
    dEn: "Aggregates every student's AI voice-coaching progress and speaking records." },
  { go: "card-ai-insights", g: "통계 / KPI", gEn: "Stats / KPI", ko: "🤖 AI 인사이트 대시보드", en: "AI Insights",
    kw: ["ai 인사이트", "인사이트", "ai가 찾은"], ekw: ["ai insight", "ai insights", "insights"],
    d: "AI가 데이터에서 찾은 경고·기회 신호를 문장으로 요약해 줍니다.",
    dEn: "Summarizes, in sentences, the warnings and opportunities the AI found in your data." },
  { go: "card-selfscore", g: "통계 / KPI", gEn: "Stats / KPI", ko: "📈 학생 참여도·자가평가 추이", en: "Engagement & Self-score Trend",
    kw: ["자가평가", "참여도 추이", "자가 점수"], ekw: ["self score", "self-assessment", "engagement trend"],
    d: "학생이 스스로 매긴 점수와 참여도의 시간별 추이를 봅니다.",
    dEn: "The trend over time of students' self-rated scores and engagement." },

  // ── 5. 회계 / 포인트 / Accounting / Points ─────────────────────
  { go: "card-accounting-mgmt", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "💰 회계관리", en: "Accounting",
    kw: ["회계", "장부", "세금", "세무", "부가세", "전표", "분개", "손익", "재무제표", "매출 정리"], ekw: ["accounting", "bookkeeping", "ledger", "tax", "vat", "invoice", "income statement"],
    d: "매출·지출·세금 장부를 정리하고 결제 내역, 환불·취소 처리를 확인합니다.",
    dEn: "Keep the revenue, expense and tax books, and review payment records including refunds and cancellations." },
  { go: "sub-c24-finance", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "🧾 카페24 회계 실데이터", en: "Cafe24 Live Finance Data",
    kw: ["카페24 회계", "실데이터 회계", "예치금"], ekw: ["cafe24", "live finance"],
    d: "카페24 서버의 실제 장부·급여·지출·세금·예치금 데이터를 그대로 가져와 봅니다.",
    dEn: "Pulls the real ledger, payroll, expense, tax and deposit data straight from the Cafe24 server." },
  { go: "card-payments-b2c", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "👨‍👩‍👧 BtoC 결제관리", en: "B2C Payments",
    kw: ["btoc", "b2c", "학부모 결제", "수강료 결제", "직판매", "수강료", "학원비", "납부"], ekw: ["b2c", "btoc", "parent payment", "tuition", "tuition fee", "payment", "payments"],
    d: "학원이 학부모에게 직접 판매한 수강료 결제 건을 조회·처리합니다.",
    dEn: "Look up and handle tuition payments the academy sold directly to parents." },
  { go: "card-payments-b2b", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "🏢 BtoB 결제관리", en: "B2B Payments",
    kw: ["btob", "b2b", "본사 결제", "대리점 결제", "가맹 결제"], ekw: ["b2b", "btob", "hq payment", "agency payment"],
    d: "학원↔본사/대리점 사이의 결제(도매) 건을 관리합니다.",
    dEn: "Manage the payments between academies and HQ/agencies (wholesale side)." },
  { go: "card-recurring-billing", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "🔄 정기결제 자동화", en: "Recurring Billing",
    kw: ["정기결제", "자동결제", "구독", "정기 결제"], ekw: ["recurring", "recurring billing", "subscription", "auto billing"],
    d: "매달 자동으로 청구되는 정기결제(구독)를 등록·중지하고 실패 건을 확인합니다.",
    dEn: "Set up or stop monthly recurring billing (subscriptions) and review failed charges." },
  { go: "card-auto-dunning", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "💸 미납 자동 추적", en: "Overdue Auto-dunning",
    // ⚠️ 'tuition'(수강료)은 BtoC 결제에도 있어 길이 동점이 나므로 복합어를 함께 둔다.
    kw: ["미납", "연체", "독촉", "미수금", "밀린", "수금", "미납 수강료", "수강료 미납"], ekw: ["overdue", "unpaid", "dunning", "arrears", "collection", "past due", "overdue tuition", "unpaid tuition", "hasn't paid", "not paid"],
    d: "수강료 미납자를 자동 추적해 단계별(1차·2차·최종) 독촉 알림을 보냅니다.",
    dEn: "Tracks unpaid tuition automatically and escalates reminder notices step by step." },
  { go: "sub-overdue", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "🔔 수강료 미납 자동 알림", en: "Overdue Auto-alert",
    kw: ["미납 알림", "미납 자동"], ekw: ["overdue alert", "overdue notice"],
    d: "미납 알림 문구와 발송 조건을 설정합니다.",
    dEn: "Set the wording and trigger conditions for overdue notices." },
  { go: "card-settlement-stats", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "📊 정산통계관리", en: "Settlement Statistics",
    kw: ["정산", "지점 정산", "가맹점 정산", "지사 정산", "정산 통계"], ekw: ["settlement", "settlements", "branch settlement", "payout"],
    d: "지점·가맹점·대리점별 정산 금액과 기간별 정산 통계를 확인합니다.",
    dEn: "Check settlement amounts per branch, franchise and agency, plus period statistics." },
  { go: "card-points-mgmt", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "🎁 포인트 & 기프티콘", en: "Points & Gifticons",
    kw: ["포인트", "적립", "기프티콘", "충전", "차감", "상점"], ekw: ["points", "point", "gifticon", "reward points", "gift card"],
    d: "학생 포인트 잔액·적립·차감을 관리하고 기프티콘 카탈로그와 교환 신청을 처리합니다.",
    dEn: "Manage student point balances, earning and deductions, plus the gifticon catalog and redemption requests." },
  { go: "sub-points-balances", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "💰 학생 포인트 잔액", en: "Student Point Balances",
    kw: ["포인트 잔액", "학생 포인트"], ekw: ["point balance", "student points", "balances"],
    d: "학생별 포인트 잔액·누적적립·누적사용·최근 내역을 봅니다.",
    dEn: "Per-student point balance, lifetime earned, lifetime spent and recent history." },
  { go: "sub-points-catalog", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "🛍️ 기프티콘 카탈로그", en: "Gifticon Catalog",
    kw: ["기프티콘 카탈로그", "상품 목록", "교환 상품"], ekw: ["gifticon catalog", "reward catalog", "gift catalog"],
    d: "포인트로 바꿀 수 있는 기프티콘 상품을 등록·수정합니다.",
    dEn: "Add and edit the gifticons students can exchange points for." },
  { go: "sub-points-redemptions", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "📦 교환 신청 내역", en: "Redemption Requests",
    kw: ["교환 신청", "교환 내역", "기프티콘 발송"], ekw: ["redemption", "redemptions", "exchange request"],
    d: "학생이 낸 기프티콘 교환 신청을 확인하고 발송 처리합니다.",
    dEn: "Review students' gifticon redemption requests and mark them sent." },
  { go: "sub-points-rules", g: "회계 / 포인트", gEn: "Accounting / Points", ko: "⚙ 자동 적립 규칙", en: "Auto-earning Rules",
    kw: ["적립 규칙", "포인트 규칙", "자동 적립"], ekw: ["earning rule", "point rule", "auto earning"],
    d: "출석·숙제·레벨업 등 어떤 행동에 몇 점을 줄지 규칙을 정합니다.",
    dEn: "Define how many points each action — attendance, homework, level-up — awards." },

  // ── 6. 학생 / 학부모 / Students / Parents ──────────────────────
  { go: "card-students-mgmt", g: "학생 / 학부모", gEn: "Students / Parents", ko: "👨‍🎓 학생관리", en: "Student Management",
    kw: ["학생관리", "학생 관리", "학생 목록", "회원관리", "회원 관리", "원생", "학생 등록", "학생 정보", "학생 검색"], ekw: ["student", "students", "student management", "student list", "member", "members", "enrollee"],
    d: "학생 명부를 검색·조회하고 등록 정보·담당 강사·수업 상태를 수정합니다.",
    dEn: "Search and browse the student roster, and edit their enrollment details, assigned teacher and class status." },
  { go: "card-school-attendance-stats", g: "학생 / 학부모", gEn: "Students / Parents", ko: "📊 학원별 학생 수업현황", en: "Attendance by School (SLP)",
    kw: ["학원별 현황", "학원별 출석", "slp 출석"], ekw: ["attendance by school", "school attendance", "slp"],
    d: "제휴 학원(SLP)별로 학생 수업·출석 통계를 봅니다.",
    dEn: "Class and attendance statistics broken down by partner school (SLP)." },
  { go: "card-family-mgmt", g: "학생 / 학부모", gEn: "Students / Parents", ko: "👨‍👩‍👧 가족 계정 통합", en: "Family Accounts",
    kw: ["가족", "형제", "자매", "가족 계정"], ekw: ["family", "sibling", "siblings", "family account"],
    d: "형제·자매를 한 가족 계정으로 묶어 결제와 알림을 통합합니다.",
    dEn: "Group siblings into one family account so billing and notifications are unified." },
  { go: "card-inquiry-mgmt", g: "학생 / 학부모", gEn: "Students / Parents", ko: "💌 신규상담 → 등록 전환", en: "New Inquiries",
    kw: ["신규상담", "신규 상담", "문의 관리", "상담 접수", "리드", "전환률"], ekw: ["inquiry", "inquiries", "new inquiry", "lead", "leads", "conversion"],
    d: "새로 들어온 상담·문의를 접수해 등록(수강 전환)까지 단계별로 관리하고 전환률을 봅니다.",
    dEn: "Take in new inquiries and manage them step by step through to enrollment, with conversion stats." },
  { go: "card-counseling-booking", g: "학생 / 학부모", gEn: "Students / Parents", ko: "📅 1:1 상담 예약", en: "Counseling Booking",
    kw: ["상담 예약", "1:1 상담", "예약 상담"], ekw: ["counseling", "counselling", "consultation booking", "book a consultation"],
    d: "학부모 1:1 상담 예약 슬롯을 열고 예약 건을 확인합니다.",
    dEn: "Open 1:1 parent counseling slots and review the bookings." },
  { go: "card-enrollments", g: "학생 / 학부모", gEn: "Students / Parents", ko: "📚 수강신청 관리", en: "Enrollment Management",
    kw: ["수강신청", "수강 신청", "등록 관리", "단체 등록", "일괄 등록"], ekw: ["enrollment", "enrollments", "enroll", "registration", "sign up"],
    d: "수강신청 건을 확인하고 반·강사·시간을 배정해 등록을 확정합니다(단체·일괄 등록 포함).",
    dEn: "Review course applications and assign class, teacher and time to confirm enrollment — including bulk enrollment." },
  { go: "card-badges-mgmt", g: "학생 / 학부모", gEn: "Students / Parents", ko: "🎮 학생 배지", en: "Student Badges",
    kw: ["배지", "뱃지", "게이미피케이션"], ekw: ["badge", "badges", "gamification", "achievement"],
    d: "학생이 받는 배지 종류와 획득 조건을 관리합니다.",
    dEn: "Manage the badges students can earn and the conditions to earn them." },
  { go: "card-community", g: "학생 / 학부모", gEn: "Students / Parents", ko: "📋 학원 게시판", en: "Community Board",
    kw: ["커뮤니티", "학원 게시판", "소식", "faq 게시판"], ekw: ["community", "community board", "news feed"],
    d: "학원 소식·FAQ 글을 올려 학생·학부모와 소통합니다.",
    dEn: "Post academy news and FAQs to communicate with students and parents." },
  { go: "card-parent-digest", g: "학생 / 학부모", gEn: "Students / Parents", ko: "📰 학부모 위클리 다이제스트", en: "Parent Weekly Digest",
    kw: ["학부모 요약", "위클리 다이제스트", "주간 요약"], ekw: ["parent digest", "weekly digest", "weekly summary"],
    d: "한 주간 학습 요약을 학부모에게 카톡으로 자동 발송합니다.",
    dEn: "Automatically sends parents a weekly learning summary by KakaoTalk." },
  { go: "card-parent-faq-bot", g: "학생 / 학부모", gEn: "Students / Parents", ko: "🤖 학부모 상담 AI 봇", en: "Parent FAQ Bot",
    kw: ["학부모 봇", "faq봇", "상담 봇"], ekw: ["faq bot", "parent bot", "chatbot"],
    d: "학부모가 자주 묻는 질문에 AI가 자동 응답하도록 문답을 관리합니다.",
    dEn: "Manage the Q&A the AI bot uses to answer parents' frequent questions automatically." },
  { go: "card-referral", g: "학생 / 학부모", gEn: "Students / Parents", ko: "🎁 추천 친구 보상", en: "Referral Rewards",
    kw: ["친구 추천", "추천 보상", "리퍼럴"], ekw: ["referral", "refer a friend", "invite reward"],
    d: "친구를 소개한 학생·학부모에게 줄 보상을 설정하고 추천 실적을 봅니다.",
    dEn: "Set the reward for referring a friend and track referral performance." },
  { go: "card-alumni", g: "학생 / 학부모", gEn: "Students / Parents", ko: "🎓 졸업생 동문 커뮤니티", en: "Alumni Community",
    kw: ["졸업생", "동문", "졸업생 커뮤니티"], ekw: ["alumni", "graduate", "graduates", "alumni community"],
    d: "수료·졸업한 학생들의 동문 커뮤니티를 운영합니다.",
    dEn: "Run the alumni community for students who finished the course." },
  { go: "card-gallery", g: "학생 / 학부모", gEn: "Students / Parents", ko: "📷 사진/영상 갤러리", en: "Photo & Video Gallery",
    kw: ["갤러리", "사진첩", "사진 영상"], ekw: ["gallery", "photo", "photos", "video gallery"],
    d: "학원 사진·영상을 올려 학생·학부모에게 공개합니다.",
    dEn: "Upload academy photos and videos to share with students and parents." },

  // ── 7. 교육 / 콘텐츠 / Education / Content ─────────────────────
  { go: "card-review-quiz", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "🧠 복습퀴즈 출제", en: "Review Quiz Builder",
    kw: ["복습퀴즈", "복습 퀴즈", "퀴즈 출제", "퀴즈"], ekw: ["review quiz", "quiz", "quizzes", "ai quiz"],
    d: "수업에서 배운 내용으로 복습 퀴즈를 만들어 학생에게 배포하고 정답률을 봅니다.",
    dEn: "Build review quizzes from what was taught, push them to students and see the score rates." },
  { go: "card-textbooks", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "📖 교재 콘텐츠 관리", en: "Textbook Content",
    kw: ["교재", "교재 콘텐츠", "교재 관리"], ekw: ["textbook", "textbooks", "course book", "teaching material"],
    d: "레벨별 교재와 교재 파일 라이브러리를 등록·수정하고 수업에 배정합니다.",
    dEn: "Register and edit textbooks by level and the textbook file library, and assign them to classes." },
  { go: "sub-textbook-files", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "📂 교재 파일 라이브러리", en: "Textbook File Library",
    kw: ["교재 파일", "교재 pdf", "개별 파일"], ekw: ["textbook file", "textbook files", "pdf library"],
    d: "개별 교재 PDF 파일을 올리고 정리합니다.",
    dEn: "Upload and organize individual textbook PDF files." },
  { go: "sub-book-roster", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "📚 교재 명부", en: "Book Roster",
    kw: ["교재 명부", "교재 목록"], ekw: ["book roster", "book list"],
    d: "실제 사용 중인 교재 명부를 확인합니다.",
    dEn: "The roster of textbooks actually in use." },
  { go: "sub-mango-videos", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "🎬 망고아이 비디오 관리", en: "Mangoi Video Management",
    kw: ["비디오 관리", "유튜브", "영상 관리"], ekw: ["video management", "youtube", "videos"],
    d: "수업·홍보용 유튜브 영상을 등록하고 배치합니다.",
    dEn: "Register and place the YouTube videos used for classes and promotion." },
  { go: "card-microlearn", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "⚡ 마이크로러닝 카톡", en: "Microlearning",
    kw: ["마이크로러닝", "오늘의 단어", "짧은 학습"], ekw: ["microlearning", "micro learning", "word of the day"],
    d: "오늘의 단어와 짧은 퀴즈를 카톡으로 매일 자동 발송합니다.",
    dEn: "Sends a word of the day and a short quiz by KakaoTalk every day, automatically." },
  { go: "card-mini-toeic", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "🎯 미니 토익", en: "Mini TOEIC",
    kw: ["미니토익", "미니 토익", "토익"], ekw: ["toeic", "mini toeic", "mock test"],
    d: "버튼 한 번으로 AI가 미니 토익 시험을 자동 출제합니다.",
    dEn: "One button and the AI generates a mini TOEIC test automatically." },
  { go: "card-pronunciation", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "🗣 발음 교정", en: "Pronunciation Coaching",
    kw: ["발음", "발음교정", "발음 연습", "파닉스"], ekw: ["pronunciation", "phonics", "speech coaching", "accent"],
    d: "학생별 발음 교정 과정과 연습 진도를 관리합니다.",
    dEn: "Manage each student's pronunciation-correction course and practice progress." },
  { go: "card-video-dict", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "🎬 영상 사전", en: "Video Dictionary",
    kw: ["영상 사전", "비디오 자막", "자막 사전"], ekw: ["video dictionary", "subtitle", "subtitles", "captions"],
    d: "영상에 자막과 단어 사전을 붙여 학습 콘텐츠로 만듭니다.",
    dEn: "Attach subtitles and a word dictionary to videos to turn them into learning content." },
  { go: "card-voice-diary", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "📔 AI 음성 일기", en: "AI Voice Diary",
    kw: ["음성 일기", "음성일기", "보이스 다이어리"], ekw: ["voice diary", "audio diary"],
    d: "학생이 말로 남긴 일기를 AI가 정리·첨삭한 결과를 관리자가 봅니다.",
    dEn: "Admins review the diaries students record by voice, cleaned up and corrected by AI." },
  { go: "card-level-tests", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "📊 레벨 테스트", en: "Level Test",
    kw: ["레벨테스트", "레벨 테스트", "배치고사", "레벨 진단", "실력 진단"], ekw: ["level test", "leveltest", "placement test", "placement"],
    d: "레벨테스트 신청·일정·결과를 관리하고 배치 레벨을 확정합니다.",
    dEn: "Manage level-test applications, schedules and results, and confirm the placement level." },
  { go: "card-lesson-insight", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "🎥 수업 리포트 (AI)", en: "Class Insight (AI)",
    kw: ["수업 리포트", "수업 인사이트", "수업 분석"], ekw: ["class insight", "lesson insight", "class analysis"],
    d: "수업 영상·음성을 AI가 분석해 발화 비율, 집중, 진도 등을 리포트로 만듭니다.",
    dEn: "The AI analyzes class audio/video and reports speaking ratio, focus and progress." },
  { go: "card-battle-mgmt", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "⚔ 영어 배틀 관리", en: "English Battle",
    kw: ["영어 배틀", "배틀", "대전"], ekw: ["battle", "english battle"],
    d: "학생끼리 겨루는 영어 배틀 게임의 일정과 결과를 관리합니다.",
    dEn: "Manage the schedule and results of the student-vs-student English battle game." },
  { go: "card-recording-storage", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "💾 녹화 보관", en: "Recording Storage",
    kw: ["녹화", "녹화본", "다시보기", "녹화 보관"], ekw: ["recording", "recordings", "replay", "recorded class"],
    d: "수업 녹화본의 용량·보관기간을 확인하고 재생·삭제합니다.",
    dEn: "Check class-recording size and retention, and play or delete them." },
  { go: "card-homework", g: "교육 / 콘텐츠", gEn: "Education / Content", ko: "📚 숙제 관리", en: "Homework",
    kw: ["숙제", "과제"], ekw: ["homework", "assignment", "assignments"],
    d: "숙제를 내주고 제출 여부·채점 결과를 학생별로 확인합니다.",
    dEn: "Assign homework and check submission and grading per student." },

  // ── 8. 자료실 / Library ────────────────────────────────────────
  //  ※ 사용설명서(매뉴얼)는 전부 자료실 안에 있다 — 각 자료실 카드에 「🎬 동영상 사용설명서」 포함.
  //     그래서 manual/설명서/가이드/요약 같은 '문서' 단어를 자료실로 연결한다.
  //     단, 대상이 붙은 말(강사 매뉴얼 등)은 강한 키워드(kw/ekw)로 해당 자료실에 직행하고,
  //     대상 없는 일반 문서 단어는 **약한 키워드(wkw/wekw)** 로 둬서
  //     "급여 사용법" 처럼 다른 메뉴가 지목된 질문을 자료실이 가로채지 않게 한다.
  { go: "card-lib-admin", g: "자료실", gEn: "Library", ko: "📕 관리자 자료실", en: "Admin Library",
    // '자료실/library' 단독도 여기로 — 운영자가 가장 먼저 볼 곳이 관리자 자료실이라서.
    kw: ["관리자 자료실", "본사 자료실", "운영 자료실", "자료실", "관리자 매뉴얼", "운영 매뉴얼", "관리자 사용설명서", "동영상 사용설명서"],
    ekw: ["admin library", "manager library", "hq library", "library", "libraries", "document room", "resource room", "admin manual", "admin guide", "operation manual", "operations manual", "video manual"],
    wkw: ["매뉴얼", "사용설명서", "사용 설명서", "설명서", "안내서", "지침서", "지침", "가이드", "사용법", "쓰는 법", "문서", "요약본", "개요", "다운로드", "자료"],
    wekw: ["manual", "manuals", "user manual", "user guide", "guide", "guides", "handbook", "documentation", "docs", "tutorial", "how to use", "instructions", "instruction", "description", "summary", "overview", "reference", "download"],
    d: "본사·관리자용 매뉴얼, 운영 문서, 양식을 올리고 내려받는 자료실입니다. 「🎬 동영상 사용설명서」도 여기에 있어요(자료실은 비밀번호로 잠겨 있어 🔓 잠금 해제 후 열립니다).",
    dEn: "The document room where HQ/admin manuals, operating documents and forms are uploaded and downloaded — including the 🎬 video manual. Each library is password-protected, so unlock it first." },
  { go: "card-lib-teacher", g: "자료실", gEn: "Library", ko: "👨‍🏫 강사 자료실", en: "Teacher Library",
    kw: ["강사 자료실", "선생님 자료실", "교사 자료실", "강사 매뉴얼", "교사 매뉴얼", "강사 사용설명서", "강사 가이드", "교육 자료"],
    ekw: ["teacher library", "teaching resources", "teacher manual", "teacher guide", "teaching manual", "training manual", "teacher handbook"],
    d: "강사에게 배포하는 교육 자료·교안·강사용 사용설명서(동영상 포함)를 모아 둔 자료실입니다.",
    dEn: "The library of teaching materials, lesson guides and the teacher manual (video included) distributed to teachers." },
  { go: "card-lib-branch", g: "자료실", gEn: "Library", ko: "🏢 지사 자료실", en: "Branch Library",
    kw: ["지사 자료실", "지점 자료실", "지사 매뉴얼", "지점 매뉴얼", "지사 사용설명서"],
    ekw: ["branch library", "branch manual", "branch guide", "branch handbook"],
    d: "지사가 쓰는 운영·영업 자료와 지사용 사용설명서를 공유하는 자료실입니다.",
    dEn: "The library where branch operating/sales documents and the branch manual are shared." },
  { go: "card-lib-agency", g: "자료실", gEn: "Library", ko: "🏬 대리점 자료실", en: "Agency Library",
    kw: ["대리점 자료실", "가맹점 자료실", "대리점 매뉴얼", "가맹점 매뉴얼", "대리점 사용설명서"],
    ekw: ["agency library", "franchise library", "agency manual", "franchise manual", "agency guide"],
    d: "대리점·가맹점용 홍보물, 영업 자료, 대리점용 사용설명서를 내려받는 자료실입니다.",
    dEn: "The library where agencies and franchises download promotional material, sales documents and the agency manual." },
  { go: "card-lib-student", g: "자료실", gEn: "Library", ko: "🎒 학생·학부모 자료실", en: "Student & Parent Library",
    kw: ["학생 자료실", "학부모 자료실", "학생·학부모 자료실", "학생 매뉴얼", "학부모 매뉴얼", "학생 사용설명서", "학부모 사용설명서", "학부모 안내서"],
    ekw: ["student library", "parent library", "student and parent library", "student manual", "parent manual", "student guide", "parent guide", "parent handbook"],
    d: "학생·학부모에게 공개하는 학습 자료, 안내문, 학생·학부모용 사용설명서를 올려 두는 자료실입니다.",
    dEn: "The library holding learning materials, guides and the student/parent manual shared with students and parents." },

  // ── 9. 시스템 / System ────────────────────────────────────────
  { go: "card-calendar", g: "시스템", gEn: "System", ko: "📅 캘린더 관리", en: "Calendar",
    kw: ["캘린더", "달력", "공휴일", "휴일", "휴가", "연차", "휴무"], ekw: ["calendar", "holiday", "holidays", "vacation", "day off"],
    d: "학원 휴일·공휴일·강사 휴가를 등록해 수업 자동 생성에서 제외시킵니다.",
    dEn: "Register academy holidays, public holidays and teacher leave so classes skip those days." },
  { go: "card-permissions", g: "시스템", gEn: "System", ko: "🔐 권한 설정", en: "Permissions",
    kw: ["권한", "역할", "접근권한", "접근 권한", "관리자 권한"], ekw: ["permission", "permissions", "role", "roles", "access control"],
    d: "직급·역할별로 어떤 메뉴를 볼 수 있는지 권한을 설정하고 시뮬레이션합니다.",
    dEn: "Set which menus each role can see, and simulate a role to verify it." },
  { go: "card-franchises", g: "시스템", gEn: "System", ko: "🏬 가맹점 관리", en: "Franchises",
    kw: ["가맹점", "대리점", "지사", "영업본부", "대표지사"], ekw: ["franchise", "franchises", "agency", "agencies", "branch", "branches"],
    d: "가맹점·대리점·지사 정보를 등록하고 소속 학생·정산 조건을 관리합니다.",
    dEn: "Register franchises, agencies and branches, and manage their students and settlement terms." },
  { go: "card-centers", g: "시스템", gEn: "System", ko: "🏫 교육센터", en: "Education Centers",
    kw: ["교육센터", "센터 관리", "현지 센터"], ekw: ["education center", "education centre", "centers", "centres"],
    d: "필리핀 현지 교육센터 정보와 소속 강사·장비 현황을 관리합니다.",
    dEn: "Manage the Philippine education centers, the teachers assigned there and their equipment status." },
  { go: "card-data-export", g: "시스템", gEn: "System", ko: "📥 데이터 내보내기 (CSV)", en: "Data Export (CSV)",
    kw: ["데이터 내보내기", "csv", "엑셀 내려받기", "백업", "데이터 추출"], ekw: ["export", "csv", "download data", "backup"],
    d: "학생·결제·출결 데이터를 CSV로 내려받습니다.",
    dEn: "Download student, payment and attendance data as CSV." },
  { go: "card-admin-alerts", g: "시스템", gEn: "System", ko: "🚨 실시간 알림 센터 (AI 이상 감지)", en: "Real-time Alert Center",
    kw: ["이상감지", "이상 감지", "실시간 알림", "이상 징후", "관리자 알림", "경고"], ekw: ["anomaly", "anomaly detection", "alert", "alerts", "real-time alert", "monitoring"],
    d: "출석 급감, 결제 실패, 수업 미입장, 비정상 로그인 같은 운영 이상 신호를 AI가 실시간으로 띄웁니다.",
    dEn: "The AI raises real-time operational anomalies — attendance drops, failed payments, no-shows, abnormal logins." },
  { go: "card-admin-ghost", g: "시스템", gEn: "System", ko: "👀 수업 관찰 (라이브)", en: "Class Observation (live)",
    kw: ["수업 관찰", "참관", "고스트", "라이브 관찰", "모니터링"], ekw: ["class observation", "observe class", "ghost view", "live monitoring"],
    d: "진행 중인 화상수업을 관리자가 조용히 관찰합니다(학생·강사에게 표시되지 않음).",
    dEn: "Lets an admin quietly observe an ongoing video class without appearing to the student or teacher." },
  { go: "card-admin-whisper", g: "시스템", gEn: "System", ko: "💬 강사 귓속말", en: "Teacher Whisper",
    kw: ["귓속말", "위스퍼"], ekw: ["whisper", "private message to teacher"],
    d: "수업 중인 강사에게만 들리는 귓속말로 지시를 전달합니다.",
    dEn: "Send an instruction only the teacher in class can hear." },
  { go: "card-attendance-status", g: "시스템", gEn: "System", ko: "🕒 출근현황", en: "Work Status",
    kw: ["출근", "출근현황", "근태"], ekw: ["work status", "clock in", "staff attendance"],
    d: "강사·직원의 출근·근무 상태를 실시간으로 봅니다.",
    dEn: "Real-time work/clock-in status of teachers and staff." },
  { go: "card-class-attendance", g: "시스템", gEn: "System", ko: "📚 출석현황 (수업당 출결)", en: "Class Attendance",
    kw: ["출석", "출결", "출석부", "결석", "지각", "출석률"], ekw: ["attendance", "absence", "absent", "late", "attendance rate"],
    d: "수업 한 건마다 학생이 출석·지각·결석이었는지 확인하고 수정합니다.",
    dEn: "Check and correct whether each student was present, late or absent for each class." },
  { go: "card-auto-attendance", g: "시스템", gEn: "System", ko: "📷 QR 출결 자동 체크", en: "QR Attendance",
    kw: ["qr 출결", "qr출결", "큐알", "qr 출석"], ekw: ["qr attendance", "qr code", "qr check-in"],
    d: "QR 코드를 찍어 출결을 자동으로 기록합니다.",
    dEn: "Records attendance automatically by scanning a QR code." },
  { go: "card-auto-schedule", g: "시스템", gEn: "System", ko: "📅 AI 주간 시간표 자동 짜기", en: "AI Auto-scheduling",
    kw: ["자동 시간표", "시간표 자동", "자동 스케줄", "자동 배정", "자동 편성"], ekw: ["auto schedule", "auto-scheduling", "automatic timetable", "auto assign"],
    d: "학생·강사 가능 시간을 근거로 AI가 주간 시간표를 자동으로 짜 줍니다.",
    dEn: "The AI builds the weekly timetable automatically from student and teacher availability." },
  { go: "card-classroom-test", g: "시스템", gEn: "System", ko: "🩺 강의실 입장·장비 점검 테스트", en: "Classroom Entry Test",
    kw: ["강의실 테스트", "입장 테스트", "장비 점검", "카메라 테스트", "마이크 테스트"], ekw: ["classroom test", "entry test", "device check", "camera test", "mic test"],
    d: "카메라·마이크·입장이 정상인지 실제 강의실로 점검합니다.",
    dEn: "Checks camera, microphone and room entry by actually opening a test classroom." },
  { go: "card-daily-briefing", g: "시스템", gEn: "System", ko: "🌅 매일 아침 자동 브리핑", en: "Daily Morning Briefing",
    kw: ["아침 브리핑", "매일 브리핑", "데일리 브리핑"], ekw: ["daily briefing", "morning briefing"],
    d: "전날 실적과 오늘 할 일을 매일 아침 자동으로 요약해 보내줍니다.",
    dEn: "Automatically sends a morning summary of yesterday's numbers and today's to-dos." },
  { go: "card-monthly-ai-report", g: "시스템", gEn: "System", ko: "📊 월간 AI 학습 레포트", en: "Monthly AI Report",
    kw: ["월간 ai 레포트", "월간 ai 리포트"], ekw: ["monthly ai report"],
    d: "한 달치 학습 데이터를 AI가 분석해 경영용 리포트로 만듭니다.",
    dEn: "The AI analyzes a month of learning data into a management report." },
  { go: "card-ops-modules", g: "시스템", gEn: "System", ko: "🧩 운영 인프라 모듈", en: "Ops Infrastructure Modules",
    kw: ["운영 모듈", "인프라 모듈"], ekw: ["ops module", "infrastructure module"],
    d: "정산·위험군·공휴일·교재 같은 운영 인프라 모듈의 동작 상태를 봅니다.",
    dEn: "Shows the status of the ops infrastructure modules — settlement, risk group, holidays, textbooks." }
];

// 부모 그룹 요약 — "메뉴가 뭐가 있어?" 류 질문에 쓰는 지식(페르소나에 주입)
var OPS_GROUPS = [
  { ko: "평가서 통합", en: "Evaluations", dKo: "학생 평가서·일괄 평가·AI 평가서 초안·AI 학습 리포트·월별/비교 리포트", dEn: "student evaluations, bulk evaluation, AI evaluation drafts, AI learning reports, monthly & comparison reports" },
  { ko: "알림 센터", en: "Notification Center", dKo: "카카오 알림톡·웹푸시·공지 스튜디오·팝업 게시·공지사항 게시판·알림 큐", dEn: "Kakao alimtalk, web push, notice studio, popups, notice board, notification queue" },
  { ko: "강사 통합", en: "Teachers", dKo: "강사관리·급여(자동 정산)·연기/변경 요청·수업 변경 이력·회선품질·수업 평가·MBTI·칭찬 통계·슈퍼바이저·시간표·수업 일지·버그 접수함", dEn: "teacher management, payroll (auto settlement), postpone/change requests, class change history, connection quality, class ratings, MBTI, praise stats, supervisor, timetable, class log, bug inbox" },
  { ko: "통계 / KPI", en: "Stats / KPI", dKo: "KPI 대시보드·일자별 차트·학생 랭킹·이탈 위험·실시간 수업·노쇼·NPS·AI 예측·음성 통계", dEn: "KPI dashboard, daily charts, student rankings, churn risk, live classes, no-shows, NPS, AI forecast, voice stats" },
  { ko: "회계 / 포인트", en: "Accounting / Points", dKo: "회계관리·BtoB/BtoC 결제·정기결제·미납 자동 추적·정산 통계·포인트 & 기프티콘", dEn: "accounting, B2B/B2C payments, recurring billing, overdue dunning, settlement stats, points & gifticons" },
  { ko: "학생 / 학부모", en: "Students / Parents", dKo: "학생관리·학원별 출석·가족 계정·신규상담·수강신청·배지·커뮤니티·상담 예약·학부모 다이제스트·FAQ봇·친구 추천·졸업생·갤러리", dEn: "student management, attendance by school, family accounts, new inquiries, enrollments, badges, community, counseling booking, parent digest, FAQ bot, referrals, alumni, gallery" },
  { ko: "교육 / 콘텐츠", en: "Education / Content", dKo: "복습퀴즈·교재 콘텐츠·마이크로러닝·미니토익·발음 교정·영상 사전·음성 일기·레벨테스트·수업 리포트(AI)·영어 배틀·녹화 보관·숙제", dEn: "review quiz, textbook content, microlearning, mini TOEIC, pronunciation, video dictionary, voice diary, level test, AI class insight, English battle, recordings, homework" },
  { ko: "자료실", en: "Library", dKo: "관리자·강사·지사·대리점·학생/학부모 자료실 5곳", dEn: "five document rooms: Admin, Teacher, Branch, Agency and Student & Parent Library" },
  { ko: "시스템", en: "System", dKo: "캘린더(휴일)·권한 설정·가맹점·교육센터·데이터 내보내기·실시간 이상감지·수업 관찰·귓속말·출근/출결·QR 출결·AI 자동 시간표", dEn: "calendar (holidays), permissions, franchises, education centers, data export, real-time anomaly alerts, class observation, whisper, work/class attendance, QR attendance, AI auto-scheduling" }
];

// 영어 키워드는 '단어 경계'로만 매칭 — 'pay' 가 'page' 를, 'center' 가 다른 문장을 가로채지 못하게.
function _opsEscRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
__name(_opsEscRe, "_opsEscRe");
function _opsMkRe(k) {
  return { k, re: new RegExp("(^|[^a-z0-9])" + _opsEscRe(k.toLowerCase()) + "([^a-z0-9]|$)") };
}
__name(_opsMkRe, "_opsMkRe");
for (var _mi = 0; _mi < OPS_MENUS.length; _mi++) {
  var _m = OPS_MENUS[_mi];
  _m._ere = (_m.ekw || []).map(_opsMkRe);
  _m._wre = (_m.wekw || []).map(_opsMkRe);   // 약한 영어 키워드(2차 통과용)
}
// 가장 '길게' 일치한 키워드를 이긴 것으로 본다 → 목록 순서에 덜 민감하고 오매칭이 줄어든다.
//   weak=true 면 wkw/wekw(문서·매뉴얼 같은 범용어)만 본다. 강한 매칭이 하나도 없을 때만 쓴다.
function _opsScan(low, weak) {
  let best = null, bestScore = 0;
  for (const m of OPS_MENUS) {
    let s = 0;
    for (const k of (weak ? m.wkw : m.kw) || []) {
      const kk = k.toLowerCase();
      if (kk && low.indexOf(kk) >= 0 && kk.length * 2 > s) s = kk.length * 2;
    }
    for (const e of (weak ? m._wre : m._ere) || []) {
      if (e.re.test(low) && e.k.length > s) s = e.k.length;
    }
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}
__name(_opsScan, "_opsScan");
function matchOpsMenu(text) {
  const low = (text || "").toString().toLowerCase().replace(/\s+/g, " ").trim();
  if (!low) return null;
  // 1차: 메뉴를 직접 가리키는 강한 키워드. 2차: '매뉴얼/설명서/가이드' 같은 범용 문서어 → 자료실.
  //  이 2단 구조 덕분에 "급여 사용법" 은 급여로 가고, "사용법 어디서 봐?" 만 자료실로 간다.
  return _opsScan(low, false) || _opsScan(low, true);
}
__name(matchOpsMenu, "matchOpsMenu");
// 위치 안내 문구 — "어디 있어?" 에 항상 실제 경로로 답하기 위해
function opsMenuPath(m, isEn) {
  if (!m) return "";
  return isEn
    ? `admin home → left sidebar → “${m.gEn}” → “${m.en}”`
    : `관리자 홈 → 왼쪽 사이드바 → 「${m.g}」 → 「${m.ko}」`;
}
__name(opsMenuPath, "opsMenuPath");
// LLM 에게 주는 근거 블록 — 이게 있으면 '일반론' 대신 이 메뉴 사실로만 답하게 한다.
function opsFactBlock(m, isEn) {
  if (!m) return "";
  return isEn
    ? `[MANGOI ADMIN FACT — the user is asking about this exact menu. Answer ONLY from this; never invent other menus, buttons or steps.]
Menu: ${m.en} (Korean label: ${m.ko})
Location: ${opsMenuPath(m, true)}
What it does: ${m.dEn}
Task: in 2-4 sentences tell the manager what THIS Mangoi menu is for, where it sits, and what they can actually do there. No generic advice, no invented steps. Write the menu name in English only — do not print the Korean label unless the user asked for it. Do not ask "shall I open it" — the system appends that line itself.`
    : `[망고아이 관리자 사실 — 사용자가 묻는 메뉴는 바로 이것이다. 아래 내용만 근거로 답하고, 다른 메뉴·버튼·절차를 지어내지 마라.]
메뉴: ${m.ko} (English: ${m.en})
위치: ${opsMenuPath(m, false)}
하는 일: ${m.d}
지시: 이 망고아이 메뉴가 무엇을 위한 곳인지, 어디에 있는지, 거기서 실제로 무엇을 할 수 있는지 2~4문장으로 답하라. 일반론·지어낸 절차 금지. '열어드릴까요?' 문장은 시스템이 붙이니 쓰지 마라.`;
}
__name(opsFactBlock, "opsFactBlock");
// LLM 이 지시를 어기고 스스로 붙인 '열어드릴까요?' 문장을 잘라낸다.
//   (서버가 확정 문구를 뒤에 붙이므로 그대로 두면 같은 질문이 두 번 나온다)
function trimOpenAsk(text) {
  let s = (text || "").trim();
  s = s.replace(/\s*(?:shall i open|would you like me to open|do you want me to open|let me know if you'?d like me to open)[^.?!\n]*[.?!]?\s*$/i, "");
  s = s.replace(/\s*[^.?!\n]*(?:열어\s*드릴까요|열어드릴까요|열어\s*볼까요|열어드릴까요)\s*[?？]?\s*$/, "");
  return s.trim();
}
__name(trimOpenAsk, "trimOpenAsk");
// 구버전 호환 — 기존 호출부/테스트가 쓰던 형태 유지
function detectMenu(msg) {
  const m = matchOpsMenu(msg);
  return m ? { go: m.go, label: m.ko, labelEn: m.en, menu: m } : null;
}
__name(detectMenu, "detectMenu");

// ══════════════════════════════════════════════════════════════════════
// 🥭 운영비서 지식 블록 (2026-07-23)
//   문제: 영어로 물으면 "라이브러리는 물리적 장소가 아니라 디지털 자원입니다"
//         같은 일반론만 답하고 실제 메뉴로 못 갔음.
//   해결: ① 망고아이가 무엇인지 ② 관리자 화면 부모 그룹 9개가 무엇인지
//         ③ 절대 일반론으로 답하지 말 것 — 을 페르소나에 못 박는다.
//   ⚠️ 그룹 목록은 OPS_GROUPS 에서 생성하므로 이 블록은 반드시 그 뒤에 온다.
// ══════════════════════════════════════════════════════════════════════
var _opsGroupsKo = OPS_GROUPS.map(function(g) { return "· 「" + g.ko + "」 — " + g.dKo; }).join("\n");
var _opsGroupsEn = OPS_GROUPS.map(function(g) { return "· “" + g.en + "” — " + g.dEn; }).join("\n");
PERSONA_OPS += "\n\n[망고아이가 무엇인가 — 일반론 금지, 아래 사실로만 답해]\n망고아이(Mangoi)는 검증된 원어민 강사의 1:1\xB71:2 화상영어 수업과 A.I 학습관리를 합친 서비스예요(20년 전통, 국내 최초 화상영어). 수업은 필리핀 직영 센터의 전담 강사가 하고, 예습\xB7복습\xB7평가서\xB7발음교정\xB7리포트는 A.I 가 맡아요. 학부모에겐 출결\xB7평가\xB7공지가 카카오톡으로 나갑니다. 중국어 수업도 운영합니다 — 현재 중국어 담당은 「중국어 강선생님」 한 분이며, 중국어 수업 요청은 모두 이 선생님 스케줄로 등록합니다. '중국어 수업은 없다'고 답하지 마세요. 너는 그 운영을 돕는 관리자 화면(admin) 안의 비서야.\n\n[관리자 화면 구조 — 왼쪽 사이드바 부모 메뉴 9개]\n" + _opsGroupsKo + "\n\n[답변 규칙 ★ 가장 중요]\n1) 메뉴\xB7기능 질문에는 반드시 망고아이 관리자 화면의 실제 메뉴로 답한다. '일반적으로는', '디지털 자원입니다' 같은 두루뭉술한 설명 금지.\n2) 사실 블록([망고아이 관리자 사실])이 주어지면 그 내용만 근거로 쓴다. 거기 없는 버튼\xB7절차를 지어내지 않는다.\n3) 어느 메뉴인지 확실하지 않으면 추측하지 말고, 위 9개 그룹 중 어느 쪽인지 되묻는다.\n4) 숫자\xB7금액\xB7학생 데이터는 지어내지 않고, 어느 메뉴에서 확인하는지를 알려준다.";
PERSONA_OPS_EN += "\n\n[What Mangoi actually is — no generic answers, use only these facts]\nMangoi is 1:1 / 1:2 video English with verified native teachers combined with A.I learning management (20 years, Korea's first video-English service). Dedicated teachers at Mangoi's own Philippine centers teach the classes, while A.I handles preview, review, evaluations, pronunciation coaching and reports. Parents get attendance, evaluations and notices via KakaoTalk. Mangoi ALSO offers Chinese lessons. There is currently exactly one Chinese teacher, Teacher Kang (Korean label: 중국어 강선생님), and every Chinese-lesson request is registered onto her schedule. Never say that Chinese lessons are not offered. You are the assistant INSIDE the Mangoi admin screen that helps run this operation.\n\n[Structure of the admin screen — the 9 parent menus in the left sidebar]\n" + _opsGroupsEn + "\n\n[Answer rules ★ most important]\n1) For any menu/feature question, answer with the REAL menu in the Mangoi admin screen. Never give vague generic explanations such as “it is not a physical location but a digital resource” or “generally speaking”.\n2) When a fact block ([MANGOI ADMIN FACT]) is given, write only from it. Never invent buttons or steps that are not in it.\n3) If you are not sure which menu is meant, do not guess — ask which of the 9 groups above they mean.\n4) Never invent numbers, amounts or student data; instead say which menu shows them.";

function extractGo(text, lang) {
  let go = null;
  const m = text.match(/\[\[\s*GO\s*:\s*([a-zA-Z_\-]+)\s*\]\]/);
  if (m) {
    const code = m[1].toLowerCase().replace(/_/g, "-");
    if (GO_CODES.indexOf(code) >= 0) go = code;
  }
  const clean = text.replace(/\[\[\s*GO\s*:[^\]]*\]\]/gi, "").replace(/\[\[\s*GO[^\]]*\]?\]?/gi, "").trim();
  const fallback = lang === "en" ? "Sorry, could you say that again?" : "\uC74C, \uB2E4\uC2DC \uD55C \uBC88 \uB9D0\uC500\uD574 \uC8FC\uC2DC\uACA0\uC5B4\uC694?";
  return { answer: clean || fallback, go };
}
__name(extractGo, "extractGo");
var GO_KEYWORDS = [
  ["lesson-enter", ["\uC218\uC5C5 \uC785\uC7A5", "\uC218\uC5C5\uC785\uC7A5", "\uC785\uC7A5", "\uB85C\uBE44", "enter class", "enter the class", "class lobby", "join the class", "join class", "enter my class"]],
  ["lesson-change", ["\uC218\uC5C5 \uC5F0\uAE30", "\uC5F0\uAE30", "\uC218\uC5C5 \uBCC0\uACBD", "\uBCC0\uACBD", "\uC218\uC5C5 \uCDE8\uC18C", "\uCDE8\uC18C", "reschedule", "postpone", "change my class", "change class", "cancel class", "cancel my class"]],
  ["precheck", ["\uC218\uC5C5 \uC9C4\uB2E8", "\uC218\uC5C5\uC9C4\uB2E8", "\uC0AC\uC804 \uC9C4\uB2E8", "\uC0AC\uC804\uC810\uAC80", "\uC0AC\uC804 \uC810\uAC80", "\uC218\uC5C5 \uC804 \uC810\uAC80", "\uC218\uC5C5\uC804\uC810\uAC80", "precheck", "pre-check", "class diagnosis"]],
  ["diagnosis", ["\uCE74\uBA54\uB77C", "\uB9C8\uC774\uD06C", "\uC18C\uB9AC\uAC00 \uC548", "\uD654\uBA74\uC774 \uC548", "\uC790\uAC00\uC9C4\uB2E8", "\uC790\uAC00 \uC9C4\uB2E8", "\uAE30\uAE30 \uBB38\uC81C", "\uAE30\uAE30\uBB38\uC81C", "\uC811\uC18D\uC774 \uC548", "\uC548 \uCF1C\uC838", "\uC548\uCF1C\uC838", "\uC548 \uB4E4\uB824", "\uC548 \uB098\uC640"]],
  ["leveltest", ["\uB808\uBCA8\uD14C\uC2A4\uD2B8", "\uB808\uBCA8 \uD14C\uC2A4\uD2B8", "\uC2E4\uB825\uD14C\uC2A4\uD2B8", "\uC2E4\uB825 \uC9C4\uB2E8", "level test", "leveltest", "placement"]],
  ["report", ["\uD3C9\uAC00\uD45C", "\uC131\uC801\uD45C", "\uC131\uC801", "report card", "grades"]],
  ["refund", ["\uD658\uBD88", "\uD658\uAE09", "\uC704\uC57D\uAE08", "\uB3CC\uB824\uBC1B", "refund", "money back"]],
  ["games", ["\uD559\uC0DD\uAC8C\uC784", "\uD559\uC0DD \uAC8C\uC784", "\uC601\uC5B4\uAC8C\uC784", "\uC601\uC5B4 \uAC8C\uC784", "\uB2E8\uC5B4\uAC8C\uC784", "\uB2E8\uC5B4 \uAC8C\uC784", "\uC288\uD305", "\uB2E8\uC5B4\uB300\uC804", "\uBBF8\uB2C8\uAC8C\uC784", "\uAC8C\uC784", "game"]],
  ["warmup", ["\uC6DC\uC5C5", "\uC6CC\uBC0D", "\uC218\uC5C5 \uC804 \uC900\uBE44", "\uC608\uC2B5", "warm up", "warmup", "warm-up"]],
  ["ai-friend", ["ai \uCE5C\uAD6C", "ai\uCE5C\uAD6C", "\uC601\uC5B4 \uCC44\uD305", "\uD68C\uD654 \uC5F0\uC2B5", "ai \uB300\uD654", "ai\uD68C\uD654", "ai friend"]],
  ["ai-write", ["ai \uAE00\uC4F0\uAE30", "ai\uAE00\uC4F0\uAE30", "\uC601\uC791", "\uC791\uBB38", "\uAE00\uC4F0\uAE30 \uCCA8\uC0AD", "writing", "ai writing"]],
  ["vocab", ["\uB2E8\uC5B4\uC7A5", "\uB2E8\uC5B4 \uC678\uC6B0", "\uC5B4\uD718", "vocabulary", "vocab"]],
  ["microquiz", ["\uBBF8\uB2C8\uD034\uC988", "\uBBF8\uB2C8 \uD034\uC988", "mini quiz", "microquiz"]],
  ["points-shop", ["\uD3EC\uC778\uD2B8\uC0C1\uC810", "\uD3EC\uC778\uD2B8 \uC0C1\uC810", "\uAE30\uD504\uD2F0\uCF58", "\uD3EC\uC778\uD2B8\uB85C", "point shop", "points shop"]],
  ["streak", ["\uC5F0\uC18D\uCD9C\uC11D", "\uC5F0\uC18D \uCD9C\uC11D", "\uC2A4\uD2B8\uB9AD", "\uCD9C\uC11D\uCCB4\uD06C", "\uCD9C\uC11D \uCCB4\uD06C", "\uAC1C\uADFC", "streak"]],
  ["speech", ["\uBC1C\uC74C\uC5F0\uC2B5", "\uBC1C\uC74C \uC5F0\uC2B5", "\uD30C\uB2C9\uC2A4", "\uBC1C\uC74C \uCF54\uCE58", "\uB2E8\uACC4\uBCC4 \uBC1C\uC74C", "pronunciation"]],
  ["mbti", ["mbti", "\uC5E0\uBE44\uD2F0\uC544\uC774", "\uC131\uACA9\uC720\uD615"]],
  ["payment", ["\uACB0\uC81C", "\uC218\uAC15\uAD8C", "\uAD6C\uB9E4", "payment", "purchase", "buy a pass", "buy passes"]],
  ["library", ["\uC790\uB8CC\uC2E4", "\uAD50\uC7AC", "\uC218\uC5C5 \uC790\uB8CC", "library", "textbook", "materials"]],
  ["mypage", ["\uB9C8\uC774\uD398\uC774\uC9C0", "\uB9C8\uC774 \uD398\uC774\uC9C0", "my page", "mypage", "\uD559\uC0DD\uC815\uBCF4", "\uD559\uC0DD \uC815\uBCF4", "\uB0B4 \uC815\uBCF4", "\uB0B4\uC815\uBCF4", "\uC790\uB140 \uC815\uBCF4", "\uC790\uB140 \uD559\uC2B5", "\uD559\uC2B5 \uD604\uD669", "\uD559\uC2B5\uD604\uD669", "\uCD9C\uACB0 \uD604\uD669", "\uCD9C\uC11D \uD604\uD669", "\uB0B4 \uD559\uC2B5"]],
  ["booking", ["\uC218\uC5C5 \uC2E0\uCCAD", "\uC218\uC5C5\uC2E0\uCCAD", "\uC608\uC57D", "book a class", "booking", "reserve a class"]],
  ["teachers", ["\uAD50\uC0AC \uC18C\uAC1C", "\uC120\uC0DD\uB2D8 \uC18C\uAC1C", "\uAC15\uC0AC \uC18C\uAC1C", "teacher introduction", "teachers", "instructors"]],
  ["review-quiz", ["\uBCF5\uC2B5\uD034\uC988", "\uBCF5\uC2B5 \uD034\uC988", "review quiz", "review-quiz"]],
  ["teacher-praise", ["\uCE6D\uCC2C \uC2A4\uD2F0\uCEE4", "\uCE6D\uCC2C\uC2A4\uD2F0\uCEE4", "\uCE6D\uCC2C \uC2A4\uD0EC\uD504"]],
  ["speech-coach", ["\uBC1C\uC74C \uCF54\uCE58", "\uBC1C\uC74C\uCF54\uCE58", "\uC2A4\uD53C\uCE58 \uCF54\uCE58", "speech coach"]],
  ["curriculum", ["\uCEE4\uB9AC\uD058\uB7FC", "\uAD50\uC721\uACFC\uC815", "\uAD50\uC721 \uACFC\uC815", "curriculum"]],
  ["trial", ["\uBB34\uB8CC\uCCB4\uD5D8", "\uBB34\uB8CC \uCCB4\uD5D8", "\uCCB4\uD5D8 \uC218\uC5C5", "free trial"]],
  ["enroll", ["\uC218\uAC15\uB4F1\uB85D", "\uC218\uAC15 \uB4F1\uB85D", "\uC218\uAC15 \uC2E0\uCCAD\uC11C", "enroll"]],
  ["reviews", ["\uC218\uAC15\uD6C4\uAE30", "\uC218\uAC15 \uD6C4\uAE30", "\uD6C4\uAE30", "\uB9AC\uBDF0", "reviews", "testimonial"]],
  ["recordings", ["\uB179\uD654\uBCF8", "\uB179\uD654", "\uB2E4\uC2DC\uBCF4\uAE30", "\uB2E4\uC2DC \uBCF4\uAE30", "recording", "replay"]],
  ["notice", ["\uACF5\uC9C0\uC0AC\uD56D", "\uACF5\uC9C0 \uC0AC\uD56D", "\uACF5\uC9C0", "notice", "announcement"]],
  ["event", ["\uC774\uBCA4\uD2B8", "\uD61C\uD0DD", "\uD504\uB85C\uBAA8\uC158", "event", "promotion"]],
  ["faq", ["\uC790\uC8FC \uBB3B\uB294", "\uC790\uC8FC\uBB3B\uB294", "faq", "\uC790\uC8FC\uD558\uB294 \uC9C8\uBB38"]],
  ["monthly-report", ["\uC6D4\uAC04 \uB9AC\uD3EC\uD2B8", "\uC6D4\uAC04\uB9AC\uD3EC\uD2B8", "\uC6D4\uBCC4 \uB9AC\uD3EC\uD2B8", "\uC6D4\uAC04 \uBCF4\uACE0\uC11C", "monthly report"]],
  ["videolesson", ["\uD654\uC0C1\uC601\uC5B4", "\uD654\uC0C1 \uC601\uC5B4", "\uD654\uC0C1\uC218\uC5C5 \uC18C\uAC1C", "video lesson"]],
  ["franchise", ["\uAC00\uB9F9", "\uCC3D\uC5C5", "\uB300\uB9AC\uC810 \uBB38\uC758", "franchise"]],
  ["goals", ["\uD559\uC2B5 \uBAA9\uD45C", "\uD559\uC2B5\uBAA9\uD45C", "\uBAA9\uD45C \uC124\uC815", "goal"]],
  ["leaderboard", ["\uB9AC\uB354\uBCF4\uB4DC", "\uC21C\uC704", "\uB7AD\uD0B9", "leaderboard", "ranking"]],
  ["admin", ["\uAD00\uB9AC\uC790 \uD398\uC774\uC9C0", "\uAD00\uB9AC\uC790\uD398\uC774\uC9C0", "\uC5B4\uB4DC\uBBFC", "admin page"]],
  ["contact", ["\uACE0\uAC1D\uC13C\uD130", "\uACE0\uAC1D \uC13C\uD130", "\uCE74\uD1A1\uC0C1\uB2F4", "\uCE74\uD1A1 \uC0C1\uB2F4", "1:1 \uBB38\uC758", "customer center"]],
  ["inquiry", ["\uC2E0\uADDC\uC0C1\uB2F4", "\uC2E0\uADDC \uC0C1\uB2F4", "\uC0C1\uB2F4 \uC2E0\uCCAD", "\uC0C1\uB2F4\uC2E0\uCCAD", "\uC0C1\uB2F4 \uC608\uC57D"]],
  ["all-menu", ["\uC804\uCCB4\uBA54\uB274", "\uC804\uCCB4 \uBA54\uB274", "all menu", "full menu", "all-menu"]]
];
function detectGo(text) {
  if (!text) return null;
  const low = text.toLowerCase();
  for (const [code, kws] of GO_KEYWORDS) {
    for (const kw of kws) {
      if (low.indexOf(kw.toLowerCase()) >= 0) return code;
    }
  }
  return null;
}
__name(detectGo, "detectGo");
function hangulRatio(s) {
  let ko = 0, tot = 0;
  for (let i = 0; i < (s || "").length; i++) {
    const c = s.charCodeAt(i);
    const isKo = (c >= 44032 && c <= 55203) || (c >= 12592 && c <= 12687);
    const isEn = (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    if (isKo) ko++;
    if (isKo || isEn) tot++;
  }
  return tot ? ko / tot : 0;
}
function hasKorean(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 44032 && c <= 55203) return true;
    if (c >= 12592 && c <= 12687) return true;
  }
  return false;
}
__name(hasKorean, "hasKorean");
var HYPHEN_CODES = ["lesson-enter", "lesson-change", "review-quiz", "all-menu", "leveltest", "mypage", "precheck", "ai-friend", "ai-write", "speech-coach", "points-shop"];
var KANJI_MAP = {
  "\u9AD4\u9A57": "\uCCB4\uD5D8",
  "\u4F53\u9A8C": "\uCCB4\uD5D8",
  "\u9AD4\u9A13": "\uCCB4\uD5D8",
  "\u8C50\u5BCC": "\uD48D\uBD80",
  "\u4E30\u5BCC": "\uD48D\uBD80",
  "\u8C4A\u5BCC": "\uD48D\uBD80",
  "\u554F\u984C": "\uBB38\uC81C",
  "\u95EE\u9898": "\uBB38\uC81C",
  "\u6642\u9593": "\uC2DC\uAC04",
  "\u65F6\u95F4": "\uC2DC\uAC04",
  "\u78BA\u8A8D": "\uD655\uC778",
  "\u786E\u8BA4": "\uD655\uC778",
  "\u9078\u64C7": "\uC120\uD0DD",
  "\u9009\u62E9": "\uC120\uD0DD",
  "\u5B78\u7FD2": "\uD559\uC2B5",
  "\u5B66\u4E60": "\uD559\uC2B5",
  "\u8AB2\u7A0B": "\uACFC\uC815",
  "\u8BFE\u7A0B": "\uACFC\uC815",
  "\u6E2C\u5B9A": "\uCE21\uC815",
  "\u6D4B\u5B9A": "\uCE21\uC815",
  "\u7DF4\u7FD2": "\uC5F0\uC2B5",
  "\u7EC3\u4E60": "\uC5F0\uC2B5",
  "\u8A2D\u5B9A": "\uC124\uC815",
  "\u8BBE\u5B9A": "\uC124\uC815",
  "\u9032\u884C": "\uC9C4\uD589",
  "\u8FDB\u884C": "\uC9C4\uD589",
  "\u63D0\u4F9B": "\uC81C\uACF5",
  "\u81EA\u8EAB": "\uC790\uC2E0",
  "\u8208\u5473": "\uD765\uBBF8",
  "\u5011": "\uB4E4",
  "\u4EEC": "\uB4E4"
};
function deKanji(text) {
  let t = text || "";
  for (const k in KANJI_MAP) {
    t = t.split(k).join(KANJI_MAP[k]);
  }
  t = t.replace(/[㐀-鿿豈-﫿]/g, "");
  t = t.replace(/[぀-ヿ]/g, "");
  return t;
}
__name(deKanji, "deKanji");
function stripLeakedCodes(text) {
  let t = text || "";
  t = t.replace(/[\(\[]\s*(lesson-enter|lesson-change|leveltest|library|report|mypage|payment|booking|precheck|teachers|review-quiz|all-menu|games|warmup|ai-friend|ai-write|vocab|microquiz|points-shop|streak|speech)\s*[\)\]]/gi, "");
  HYPHEN_CODES.forEach(function(c) {
    t = t.replace(new RegExp("(^|[^a-zA-Z])" + c + "([^a-zA-Z]|$)", "gi"), "$1$2");
  });
  t = deKanji(t);
  return t.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}
__name(stripLeakedCodes, "stripLeakedCodes");

// ═══════════════════════════════════════════════════════════════
// 🎓 자동 수강등록 파서 (2026-07-23)
//   "아이디/비번 + 강사 + 요일 + 시간" 을 말하면 비서가 직접 등록까지 한다.
//   ⚠️ 이 경로는 LLM 을 호출하지 않는다 — 비밀번호가 모델·로그로 새어나가지 않도록
//      전부 결정론적 정규식으로만 해석한다.
//   실제 DB 쓰기는 관리자 페이지(부모창)가 /api/admin/ai-action 으로 수행한다.
// ═══════════════════════════════════════════════════════════════
// 🇨🇳 중국어 담당 강사 — 지금은 강선생님 한 분뿐. 늘어나면 여기 대신 teachers 조회로 바꿀 것.
var CHINESE_TEACHER_NAME = "중국어 강선생님";
var CHINESE_RE = /중국어|중국말|중궈|\bchinese\b|\bmandarin\b/i;
var ENROLL_DOW_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ENROLL_DOW_KO = { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" };
function enrollExtractDays(msg) {
  const KO = { "월": "mon", "화": "tue", "수": "wed", "목": "thu", "금": "fri", "토": "sat", "일": "sun" };
  const out = [];
  let m;
  // ① '화수목금요일' · '월요일' — 요일 접미사가 붙은 한글 요일 묶음
  const re1 = /([월화수목금토일]{1,7})\s*요일/g;
  while ((m = re1.exec(msg)) !== null) { for (const ch of m[1]) out.push(KO[ch]); }
  // ② '월, 수' · '월·수' — 구분자로 떨어진 단일 요일 (‘수업’의 ‘수’ 같은 오탐 방지)
  const re2 = /(^|[\s,、·・/|+])([월화수목금토일])(?=[\s,、·・/|+]|$)/g;
  while ((m = re2.exec(msg)) !== null) out.push(KO[m[2]]);
  // ②-b '화목' · '월수금' — 구분자 없이 붙여 쓴 요일 묶음(한국에서 가장 흔한 표기).
  //     2자 이상 + 앞뒤가 경계일 때만 → '수업'의 '수', '일요일' 같은 오탐을 피한다.
  const re2b = /(^|[\s,、·・/|+(\[])([월화수목금토일]{2,7})(?=[\s,、·・/|+)\]]|$|반|요일|\d)/g;
  while ((m = re2b.exec(msg)) !== null) {
    const run = m[2];
    if (new Set(run).size !== run.length) continue;   // 같은 요일이 겹치면 요일 묶음이 아님
    for (const ch of run) out.push(KO[ch]);
  }
  // ③ 영문 요일
  const re3 = /\b(mon|tues?|wed|thur?s?|fri|sat|sun)(day)?\b/gi;
  while ((m = re3.exec(msg)) !== null) {
    const k = m[1].toLowerCase().slice(0, 3);
    out.push(k === "tue" ? "tue" : k === "thu" ? "thu" : k);
  }
  const uniq = [];
  for (const d of out) if (d && uniq.indexOf(d) < 0) uniq.push(d);
  return uniq.sort(function(a, b) { return ENROLL_DOW_ORDER.indexOf(a) - ENROLL_DOW_ORDER.indexOf(b); });
}
function enrollExtractTime(msg) {
  const pm = /오후|저녁|밤|pm|p\.m/i.test(msg);
  const am = /오전|아침|am|a\.m/i.test(msg);
  let h = -1, mi = 0, m;
  if ((m = msg.match(/(\d{1,2})\s*시\s*반/)) !== null) { h = +m[1]; mi = 30; }
  else if ((m = msg.match(/(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/)) !== null) { h = +m[1]; mi = m[2] ? +m[2] : 0; }
  else if ((m = msg.match(/(\d{1,2})\s*:\s*(\d{2})/)) !== null) { h = +m[1]; mi = +m[2]; }
  if (h < 0 || h > 24 || mi > 59) return "";
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23) return "";
  return ("0" + h).slice(-2) + ":" + ("0" + mi).slice(-2);
}
function enrollStripParticle(v) {
  let s = String(v || "").trim().replace(/[.,!?]+$/, "");
  // 'mango1234이야' 처럼 ASCII 값 뒤에 한글 조사가 붙은 경우만 제거 (한글 비번은 건드리지 않음)
  if (/^[\x21-\x7e]+[가-힣]+$/.test(s)) s = s.replace(/[가-힣]+$/, "");
  return s;
}
function enrollParseFields(msg) {
  const f = { login_id: "", password: "", student_name: "", teacher_name: "", days: [], time: "", weekly: 0, duration_min: 0 };
  let m;
  if ((m = msg.match(/(?:아이디|계정|로그인\s*(?:아이디|id)|\bid)\s*(?:는|은|가|이|를|을|:|=)?\s*([A-Za-z0-9._@-]{3,40})/i)) !== null) f.login_id = m[1];
  if ((m = msg.match(/(?:비밀번호|비밀번오|비번|비변|비민|패스워드|패스웓|암호|\bpw\b|password|passcode)\s*(?:는|은|가|이|를|을|:|=)?\s*(\S{4,40})/i)) !== null) f.password = enrollStripParticle(m[1]);
  const NAME_STOP = ["register","enroll","enrol","the","a","an","new","this","that","my","our","for","and","with","please","add","create","book","sign","up","student","teacher","name"];
  if ((m = msg.match(/([가-힣]{2,4})\s*(?:학생|어린이|원생)/)) !== null) f.student_name = m[1];
  else if ((m = msg.match(/\bstudent\s+([A-Za-z][A-Za-z-]{1,19})/i)) !== null && NAME_STOP.indexOf(m[1].toLowerCase()) < 0) f.student_name = m[1];
  else if ((m = msg.match(/([A-Za-z][A-Za-z-]{1,19})\s*(?:학생|student(?!\w))/i)) !== null && NAME_STOP.indexOf(m[1].toLowerCase()) < 0) f.student_name = m[1];
  else if ((m = msg.match(/(?:이름|성함|name)\s*(?:는|은|이|:|=)?\s*([가-힣]{2,5}|[A-Za-z][A-Za-z-]{1,19})/i)) !== null) f.student_name = m[1];
  if ((m = msg.match(/([가-힣]{1,6})\s*(?:선생님|샘|쌤|강사)/)) !== null) f.teacher_name = m[1] + "선생님";
  else if ((m = msg.match(/([A-Za-z][A-Za-z-]{1,19})\s*(?:선생님|쌤|샘|강사)/)) !== null) f.teacher_name = m[1];
  else if ((m = msg.match(/\bteacher\s*[:=]?\s*([A-Za-z][A-Za-z-]{1,19})/i)) !== null) f.teacher_name = m[1];
  else if ((m = msg.match(/([A-Za-z][A-Za-z-]{1,19})\s+teacher\b/i)) !== null) f.teacher_name = m[1];
  f.days = enrollExtractDays(msg);
  f.time = enrollExtractTime(msg);
  if ((m = msg.match(/주\s*(\d)\s*회/)) !== null) f.weekly = +m[1];
  else if ((m = msg.match(/(\d)\s*times?\s*(?:a|per)\s*week/i)) !== null) f.weekly = +m[1];
  if ((m = msg.match(/(\d{2})\s*분/)) !== null && [20, 30, 40].indexOf(+m[1]) >= 0) f.duration_min = +m[1];
  else if ((m = msg.match(/(\d{2})\s*min/i)) !== null && [20, 30, 40].indexOf(+m[1]) >= 0) f.duration_min = +m[1];
  // 🇨🇳 중국어 수업 = 강선생님 (중국어 담당이 이 분 한 명뿐이라 결정론적으로 배정)
  //    ⚠️ 이 줄을 위 if/else-if 체인 '사이'에 넣으면 뒤의 else 가 이 if 에 붙어 분(min) 파싱이 죽는다.
  //    강사를 따로 말했으면 그 강사가 이긴다(덮어쓰기 금지).
  if (!f.teacher_name && CHINESE_RE.test(msg)) f.teacher_name = CHINESE_TEACHER_NAME;
  return f;
}
function enrollMerge(draft, f) {
  const d = Object.assign({ login_id: "", password: "", student_name: "", teacher_name: "", days: [], time: "", weekly: 0, duration_min: 0 }, draft || {});
  if (f.login_id) d.login_id = f.login_id;
  if (f.password) d.password = f.password;
  if (f.student_name) d.student_name = f.student_name;
  if (f.teacher_name) d.teacher_name = f.teacher_name;
  if (f.days && f.days.length) d.days = f.days;
  if (f.time) d.time = f.time;
  if (f.weekly) d.weekly = f.weekly;
  if (f.duration_min) d.duration_min = f.duration_min;
  if (!Array.isArray(d.days)) d.days = [];
  return d;
}
/** 등록 의도인가? — 메뉴 위치 질문("수강신청 어디 있어?")과 구분한다 */
function enrollIntent(msg, f) {
  const strong = /(등록|수강\s*신청|신청|배정|개설|넣어\s*줘|잡아\s*줘)/.test(msg)
    || /\b(enroll|enrol|register|sign\s*up)\b/i.test(msg);
  // 약한 동사는 '수업/레슨' 이 같이 있을 때만 등록으로 본다(메뉴 안내 질문과 구분)
  const weak = /\b(add|create|set\s*up|schedule|book|assign|put|make)\b/i.test(msg)
    && /\b(class|lesson|course)\b|수업|레슨/i.test(msg);
  // "정우영 학생 중국어 수업 하라고 해" 처럼 등록 동사가 없어도, 중국어+수업이면 등록 의도로 본다.
  //   (중국어는 강사가 한 명이라 어느 스케줄인지 모호하지 않음)
  const chinese = CHINESE_RE.test(msg) && /수업|클래스|레슨|\bclass\b|\blesson\b/i.test(msg);
  const trigger = strong || weak || chinese;
  if (!trigger) return false;
  const filled = (f.login_id ? 1 : 0) + (f.days.length ? 1 : 0) + (f.time ? 1 : 0) + (f.teacher_name ? 1 : 0) + (f.student_name ? 1 : 0);
  // 위치를 묻는 문장은 등록 정보가 실제로 없으면 기존 메뉴 안내로 넘긴다
  if (/어디|위치|메뉴|찾아|\bwhere\b|\bhow do i\b/i.test(msg) && !(f.days.length && f.time)) return false;
  // 중국어는 강사가 이미 정해져 있어 '어느 수업인지' 모호하지 않다 →
  // 학생·요일·시간이 아직 없어도 등록 흐름으로 들여보내 부족한 것을 되묻게 한다.
  if (chinese) return true;
  return filled >= 2;
}
function enrollAffirm(msg) {
  const n = String(msg || "").trim().toLowerCase().replace(/[^a-z0-9가-힣ㄱ-ㅎ]/g, "");
  if (!n) return false;
  if (["네", "넵", "예", "응", "어", "그래", "좋아", "맞아", "ㅇㅇ", "ㅇㅋ", "오케이", "콜", "yes", "yeah", "yep", "ok", "okay", "sure", "y"].indexOf(n) >= 0) return true;
  return /^(등록해|등록하자|등록해줘|등록해주세요|진행해|진행해줘|해줘|하자|맞아요|그렇게|register|goahead|doit|proceed|confirm)/.test(n);
}
function enrollCancel(msg) {
  return /^(취소|그만|아니|됐어|중단|나중에|(cancel|stop|never\s*mind)(?![a-z])|(no|nope)(?![a-z]))/i.test(String(msg || "").trim());
}
/** 대화 상태를 진행시키고 (부족하면 되묻고, 다 모이면 확인카드) 응답 본문을 만든다 */
function enrollRespond(draft, isEn) {
  const missing = [];
  if (!draft.login_id) missing.push("login_id");
  if (!draft.teacher_name) missing.push("teacher_name");
  if (!draft.days.length) missing.push("days");
  if (!draft.time) missing.push("time");
  if (missing.length) {
    const askKo = { login_id: "🆔 학생 아이디", teacher_name: "👩‍🏫 강사 이름", days: "📅 수업 요일", time: "⏰ 수업 시간" };
    const askEn = { login_id: "🆔 student ID", teacher_name: "👩‍🏫 teacher name", days: "📅 class days", time: "⏰ class time" };
    const list = missing.map(function(k) { return isEn ? askEn[k] : askKo[k]; }).join(isEn ? ", " : ", ");
    const got = [];
    if (draft.login_id) got.push(isEn ? "ID " + draft.login_id : "아이디 " + draft.login_id);
    if (draft.student_name) got.push(isEn ? "name " + draft.student_name : "이름 " + draft.student_name);
    if (draft.teacher_name) got.push(isEn ? "teacher " + draft.teacher_name : "강사 " + draft.teacher_name);
    if (draft.days.length) got.push(draft.days.map(function(d) { return isEn ? d : ENROLL_DOW_KO[d]; }).join(isEn ? "," : "·") + (isEn ? "" : "요일"));
    if (draft.time) got.push(draft.time);
    const head = got.length ? (isEn ? "Got it so far: " + got.join(" / ") + ".\n" : "여기까지 확인했어요: " + got.join(" / ") + ".\n") : "";
    return {
      answer: head + (isEn
        ? "To register the class I still need " + list + ". (Password is optional — say it only if you want to set one.)"
        : "수업을 등록하려면 " + list + " 가 더 필요해요. (비밀번호는 선택이에요 — 새로 정해 주실 때만 말씀해 주세요.)"),
      enroll_draft: draft, enroll_missing: missing, enroll_ready: false
    };
  }
  const weekly = draft.weekly || draft.days.length;
  const dur = draft.duration_min || 20;
  const daysTxt = isEn
    ? draft.days.map(function(d) { return d.charAt(0).toUpperCase() + d.slice(1); }).join(", ")
    : draft.days.map(function(d) { return ENROLL_DOW_KO[d]; }).join("·") + "요일";
  const lines = isEn ? [
    "I'll register it exactly like this — please check:",
    "🆔 Student: " + (draft.student_name ? draft.student_name + " (" + draft.login_id + ")" : draft.login_id),
    draft.password ? "🔑 Password: " + new Array(draft.password.length + 1).join("●") + " (will be set)" : "🔑 Password: keep as is",
    "👩‍🏫 Teacher: " + draft.teacher_name,
    "📅 " + daysTxt + " " + draft.time + " · " + dur + " min · " + weekly + "x/week"
  ] : [
    "이대로 등록할게요. 확인해 주세요.",
    "🆔 학생: " + (draft.student_name ? draft.student_name + " (" + draft.login_id + ")" : draft.login_id),
    draft.password ? "🔑 비밀번호: " + new Array(draft.password.length + 1).join("●") + " (새로 설정)" : "🔑 비밀번호: 기존 그대로",
    "👩‍🏫 강사: " + draft.teacher_name,
    "📅 " + daysTxt + " " + draft.time + " · " + dur + "분 · 주" + weekly + "회"
  ];
  if (draft.weekly && draft.weekly !== draft.days.length) {
    lines.push(isEn
      ? "⚠️ You said " + draft.weekly + "x/week but gave " + draft.days.length + " day(s). I'll use the days above."
      : "⚠️ 주" + draft.weekly + "회라고 하셨는데 요일은 " + draft.days.length + "개예요. 위 요일 기준으로 등록합니다.");
  }
  return {
    answer: lines.join("\n"),
    enroll_draft: draft,
    enroll_missing: [],
    enroll_ready: true,
    enroll_payload: {
      student: { login_id: draft.login_id, password: draft.password || "", name: draft.student_name || "" },
      teacher_name: draft.teacher_name,
      days: draft.days,
      time: draft.time,
      duration_min: dur,
      class_type: "regular"
    },
    confirm_text: isEn ? "Register now" : "이대로 등록",
    speak_text: isEn
      ? "Please check the enrollment details and press Register."
      : "등록 내용을 확인하시고 등록 버튼을 눌러 주세요."
  };
}

async function handleChat(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method === "GET") return json({ status: "ok", note: 'POST {"message":"..."}' });
  if (request.method !== "POST") return json({ error: "POST \uBA54\uC11C\uB4DC\uB9CC \uD5C8\uC6A9\uB429\uB2C8\uB2E4." }, 405);
  let body = {};
  try {
    body = await request.json();
  } catch (_) {
  }
  const message = (body && body.message || "").toString().trim().slice(0, 1e3);
  const mode = body && body.mode === "ops" ? "ops" : "student";
  // 🌐 언어는 화면(UI) 설정을 우선한다. 예전엔 메시지에 한글이 한 글자만 있어도(학생 이름 등)
  //    영어 관리자에게 한국어로 답했다. 단, 영어 화면이어도 문장이 통째로 한국어면 한국어로 답한다.
  const uiLang = (body && (body.lang === "en" || body.lang === "ko")) ? body.lang : "";
  let lang = uiLang || (hasKorean(message) ? "ko" : "en");
  if (uiLang === "en" && hangulRatio(message) > 0.4) lang = "ko";
  if (!message) return json({ error: "message \uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4." }, 400);
  if (mode === "ops") {
    // 🎓 자동 수강등록 — 진행 중인 등록 대화이거나 등록 의도면 LLM 없이 결정론적으로 처리한다.
    //   (비밀번호가 모델·로그로 흘러가지 않게 하려면 이 분기가 반드시 LLM 호출보다 앞에 있어야 함)
    {
      const draftIn = (body && body.enroll_draft && typeof body.enroll_draft === "object") ? body.enroll_draft : null;
      const f = enrollParseFields(message);
      const inFlow = !!draftIn;
      if (inFlow && enrollCancel(message)) {
        return json({ answer: lang === "en" ? "Okay, I cancelled the enrollment. Nothing was saved." : "\uB124, \uC218\uAC15\uB4F1\uB85D\uC744 \uCDE8\uC18C\uD588\uC5B4\uC694. \uC800\uC7A5\uB41C \uAC74 \uC5C6\uC2B5\uB2C8\uB2E4.", enroll_cancel: true });
      }
      const anyNew = !!(f.login_id || f.password || f.student_name || f.teacher_name || f.days.length || f.time || f.weekly || f.duration_min);
      const affirm = enrollAffirm(message);
      // 등록 대화 중인데 새 정보도 없고 확인/등록말도 아니면 → 딴 질문으로 보고 흐름을 빠져나간다
      const exitFlow = inFlow && !anyNew && !affirm && !enrollIntent(message, f);
      if (!exitFlow && (inFlow || enrollIntent(message, f))) {
        const merged = enrollMerge(draftIn, f);
        const r = enrollRespond(merged, lang === "en");
        // "네"·"등록해줘" 로 확인하면 버튼을 누르지 않아도 바로 실행되게 신호를 준다
        if (r.enroll_ready && affirm && !anyNew) r.auto_confirm = true;
        return json(Object.assign({ go: null, enroll: true }, r));
      }
      // exitFlow 면 아래 일반 처리로 내려간다. 응답에 enroll 플래그가 없으므로 프런트가 등록 대화를 정리한다.
    }
    if (isPointsQuestion(message)) {
      const isEn = lang === "en";
      const name = extractStudentName(message);
      let answer;
      if (name) {
        answer = isEn ? `In Mangoi, "\uD3EC\uC778\uD2B8" means student points. Let me open \u{1F381} Points & Gifts \u2192 \u{1F4B0} Student Balances and search for ${name} \u2014 you'll see the balance, lifetime earned/spent and recent history.` : `\uD3EC\uC778\uD2B8\uB294 \uB9DD\uACE0\uC544\uC774\uC758 \u2018\uD559\uC0DD \uD3EC\uC778\uD2B8\u2019\uC608\uC694. \u300C\u{1F381} \uD3EC\uC778\uD2B8 & \uAE30\uD504\uD2F0\uCF58 \u2192 \u{1F4B0} \uD559\uC0DD \uD3EC\uC778\uD2B8 \uC794\uC561\u300D\uC744 \uC5F4\uACE0 ${name} \uD559\uC0DD\uC744 \uAC80\uC0C9\uD574 \uB4DC\uB9B4\uAC8C\uC694. \uC794\uC561\xB7\uB204\uC801\uC801\uB9BD\xB7\uB204\uC801\uC0AC\uC6A9\uACFC \uCD5C\uADFC \uB0B4\uC5ED\uC744 \uD655\uC778\uD558\uC2E4 \uC218 \uC788\uC5B4\uC694.`;
      } else {
        answer = isEn ? `"\uD3EC\uC778\uD2B8" means Mangoi's student points \u2014 earned via attendance, homework, level-ups, etc., and redeemable for gifticons. Opening \u{1F381} Points & Gifts \u2192 \u{1F4B0} Student Balances now. Tell me a student's name and I'll search it for you.` : `\uD3EC\uC778\uD2B8\uB294 \uB9DD\uACE0\uC544\uC774\uC758 \u2018\uD559\uC0DD \uD3EC\uC778\uD2B8\u2019\uC608\uC694. \uCD9C\uC11D\xB7\uC219\uC81C\xB7\uB808\uBCA8\uC5C5 \uB4F1\uC73C\uB85C \uC801\uB9BD\uB418\uACE0, \uCDA9\uC804\xB7\uCC28\uAC10\uD558\uAC70\uB098 \uAE30\uD504\uD2F0\uCF58\uC73C\uB85C \uAD50\uD658\uD560 \uC218 \uC788\uC5B4\uC694. \u300C\u{1F381} \uD3EC\uC778\uD2B8 & \uAE30\uD504\uD2F0\uCF58 \u2192 \u{1F4B0} \uD559\uC0DD \uD3EC\uC778\uD2B8 \uC794\uC561\u300D \uBA54\uB274\uB97C \uC5F4\uC5B4 \uB4DC\uB9B4\uAC8C\uC694. \uD559\uC0DD \uC774\uB984\uC744 \uB9D0\uC500\uD558\uC2DC\uBA74 \uBC14\uB85C \uAC80\uC0C9\uD574 \uBCF4\uC5EC\uB4DC\uB9B4\uAC8C\uC694.`;
      }
      return json({ answer, go: "points", goLabel: isEn ? "Points & Gifts \u2192 Student Balances" : "\uD3EC\uC778\uD2B8 & \uAE30\uD504\uD2F0\uCF58 \u2192 \uD559\uC0DD \uD3EC\uC778\uD2B8 \uC794\uC561" });
    }
    if (isRefundQuestion(message)) {
      const isEn = lang === "en";
      const answer = isEn ? "Here's our refund schedule \u2014 the rate depends on how far the course has progressed. Shall I open the full Refund Policy page?" : "\uD658\uBD88 \uAE30\uC900\uC744 \uC548\uB0B4\uD574 \uB4DC\uB9B4\uAC8C\uC694. \uD658\uBD88 \uBE44\uC728\uC740 \uC218\uC5C5 \uC9C4\uD589 \uC815\uB3C4\uC5D0 \uB530\uB77C \uB2EC\uB77C\uC838\uC694. \uC790\uC138\uD55C \uD658\uBD88\uADDC\uC815 \uD398\uC774\uC9C0\uB97C \uC5F4\uC5B4\uB4DC\uB9B4\uAE4C\uC694?";
      return json({ answer, refund: true, go: "refund", goLabel: isEn ? "Refund Policy" : "\uD658\uBD88 \uADDC\uC815" });
    }
    const isEn = lang === "en";
    // 🧭 질문에서 먼저 메뉴를 확정한다(한/영 동일). 확정되면 그 메뉴의 '사실'을 LLM 근거로 넣는다.
    let menu = matchOpsMenu(message);
    let answer = "";
    try {
      const r = await callAI(message, env, lang, "ops", opsFactBlock(menu, isEn));
      const parsed = extractGo(r.answer, lang);
      answer = stripLeakedCodes(parsed.answer);
      if (!menu) menu = matchOpsMenu(answer);   // 질문에서 못 잡으면 답변 본문 단서로 감지(폴백)
    } catch (e) {
      // LLM 이 죽어도(뉴런 소진 등) 메뉴를 알면 사실 기반으로 직접 답한다 — 빈손으로 돌려보내지 않는다.
      if (!menu) {
        return json({ answer: isEn ? "Sorry, something went wrong. Could you ask again?" : "죄송해요, 잠시 문제가 생겼어요. 다시 한 번 물어봐 주시겠어요?", detail: String(e) });
      }
    }
    if (menu) {
      answer = trimOpenAsk(answer);
      if (!answer) answer = isEn ? `${menu.en} — ${menu.dEn}` : `${menu.ko} — ${menu.d}`;
      const where = isEn
        ? `\n\n📍 Where: ${opsMenuPath(menu, true)}\n📂 Shall I open “${menu.en}” for you?`
        : `\n\n📍 위치: ${opsMenuPath(menu, false)}\n📂 ‘${menu.ko}’ 메뉴로 열어드릴까요?`;
      return json({ answer: answer + where, go: menu.go, goLabel: isEn ? menu.en : menu.ko });
    }
    return json({ answer, go: null });
  }
  if (isRefundQuestion(message)) {
    const intro = lang === "en" ? "Mangoi's refund follows the Office of Education's policy, calculated by how much of the course has been completed \u2014 please see the table below." : "\uB9DD\uACE0\uC544\uC774 \uD658\uBD88\uC740 \uAD50\uC721\uCCAD \uD658\uBD88\uADDC\uC815\uC5D0 \uB530\uB77C \uC218\uC5C5 \uC9C4\uD589 \uC815\uB3C4\uC5D0 \uB9DE\uCDB0 \uC544\uB798 \uD45C \uAE30\uC900\uC73C\uB85C \uCC98\uB9AC\uB3FC\uC694. \uC544\uB798 \uD45C\uB97C \uCC38\uACE0\uD574 \uC8FC\uC138\uC694!";
    return json({ answer: intro, refund: true, go: "refund", lang });
  }
  try {
    const r = await callAI(message, env, lang, "student");
    const parsed = extractGo(r.answer, lang);
    const go = detectGo(message) || parsed.go || detectGo(parsed.answer);
    const answer = stripLeakedCodes(parsed.answer);
    return json({ answer, go });
  } catch (e) {
    return json({ answer: lang === "en" ? "Sorry, something went wrong. Could you ask again?" : "\uC8C4\uC1A1\uD574\uC694, \uC7A0\uC2DC \uBB38\uC81C\uAC00 \uC0DD\uACBC\uC5B4\uC694. \uB2E4\uC2DC \uD55C \uBC88 \uBB3C\uC5B4\uBD10 \uC8FC\uC2DC\uACA0\uC5B4\uC694?", detail: String(e) });
  }
}
__name(handleChat, "handleChat");
var JAESUN_VOICE_ID = "tc_684a7a1446e2a628b5b07230";
var VOICE_MODEL = "ssfm-v30";
var cachedStudentVoiceId = null;
async function pickVoiceId(env, mode) {
  if (mode === "ops") {
    return env && env.TYPECAST_VOICE_ID || JAESUN_VOICE_ID;
  }
  if (env && env.TYPECAST_VOICE_ID_STUDENT) return env.TYPECAST_VOICE_ID_STUDENT;
  if (cachedStudentVoiceId) return cachedStudentVoiceId;
  try {
    const r = await fetch(
      "https://api.typecast.ai/v2/voices?model=ssfm-v30&gender=female&age=young_adult",
      { headers: { "X-API-KEY": env.TYPECAST_API_KEY } }
    );
    if (r.ok) {
      const data = await r.json();
      const list = Array.isArray(data) ? data : data && (data.voices || data.data || data.result);
      if (Array.isArray(list)) {
        const v = list.find((x) => x && x.voice_id);
        if (v) {
          cachedStudentVoiceId = v.voice_id;
          return cachedStudentVoiceId;
        }
      }
    }
  } catch (_) {
  }
  return null;
}
__name(pickVoiceId, "pickVoiceId");
async function handleTTS(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "POST \uBA54\uC11C\uB4DC\uB9CC \uD5C8\uC6A9\uB429\uB2C8\uB2E4." }, 405);
  const key = env.TYPECAST_API_KEY || "";
  if (!key) return json({ error: "no_tts_key" }, 503);
  let body = {};
  try {
    body = await request.json();
  } catch (_) {
  }
  const text = (body && body.text || "").toString().trim().slice(0, 2e3);
  const mode = body && body.mode === "ops" ? "ops" : "student";
  if (!text) return json({ error: "empty" }, 400);
  const voiceId = await pickVoiceId(env, mode);
  if (!voiceId) return json({ error: "no_voice" }, 503);
  const payload = {
    voice_id: voiceId,
    text,
    model: VOICE_MODEL,
    language: "kor",
    prompt: { emotion_type: "preset", emotion_preset: "happy", emotion_intensity: 1 },
    output: { volume: 100, audio_pitch: 0, audio_tempo: 1, audio_format: "mp3" }
  };
  let r;
  try {
    r = await fetch("https://api.typecast.ai/v1/text-to-speech", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return json({ error: "tts_fetch_failed", detail: String(e) }, 502);
  }
  if (!r.ok) {
    const det = await r.text();
    return json({ error: "tts_failed", status: r.status, detail: det.slice(0, 400) }, 502);
  }
  return new Response(r.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", ...CORS }
  });
}
__name(handleTTS, "handleTTS");
// ── 여성 음성 서버 TTS(Workers AI) — 상담직원은 "여자 목소리"여야 해서 화자를 고를 수 있는
//    Workers AI 모델을 1순위로 쓴다: ko=MeloTTS(kr, 여성) · en=Aura-2(asteria, 여성).
//    Google 번역 TTS는 화자 선택이 불가(한국어 기본음이 남자처럼 들림) → 폴백으로 강등.
//    ※ Edge readaloud 무료 API·StreamElements는 2026-07 현재 폐쇄(404/401)라 사용 불가.
function b64ToBytes(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
__name(b64ToBytes, "b64ToBytes");
async function aiFemaleTTS(env, text, tl) {
  if (!env.AI) throw new Error("no_ai_binding");
  // ko: MeloTTS(kr)는 한국어를 제대로 발화 못함(웅얼거림, Whisper 전사로 확인) → Google 폴백 사용.
  //     여성 톤은 프론트에서 playbackRate 피치업으로 만든다(student.html/index.html speak()).
  if (tl === "en") {
    const raw = await env.AI.run("@cf/deepgram/aura-2-en", { text, speaker: "asteria" }, { returnRawResponse: true });
    let buf = null;
    if (raw instanceof Response) {
      const ct = raw.headers.get("content-type") || "";
      if (raw.ok && /audio/i.test(ct)) buf = await raw.arrayBuffer();
      else throw new Error("aura_http_" + raw.status);
    } else if (raw instanceof ArrayBuffer) buf = raw;
    else if (raw && raw.body) buf = await new Response(raw.body).arrayBuffer();
    else if (raw && raw.audio) buf = b64ToBytes(String(raw.audio)).buffer;
    if (!buf || buf.byteLength < 200) throw new Error("aura_empty");
    return ["aura2-asteria", new Uint8Array(buf)];
  }
  throw new Error("no_ai_route_" + tl);   // zh 등은 바로 Google 폴백
}
__name(aiFemaleTTS, "aiFemaleTTS");
// 무료 서버 TTS — 1순위 Edge 신경망 여성 음성, 실패 시 Google 번역 TTS(무키·크레딧 0) 폴백.
// 브라우저 speechSynthesis가 없는 환경(안드로이드 앱 WebView 등)에서도 소리가 나도록 보장.
// Google TTS는 요청당 ~200자 제한 → 문장 경계로 잘라 여러 MP3를 이어붙여 반환.
async function handleTTSFree(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  let text = "";
  let lang = "ko";
  if (request.method === "GET") {
    text = url.searchParams.get("q") || "";
    lang = (url.searchParams.get("lang") || "ko").toLowerCase();
  } else {
    try {
      const j = await request.json();
      text = String(j && j.text || "");
      lang = String(j && j.lang || "ko").toLowerCase();
    } catch (_) {
    }
  }
  const tl = lang === "en" || lang === "en-us" ? "en" : lang === "zh" || lang === "zh-cn" || lang === "cn" ? "zh-CN" : "ko";
  text = text.replace(/\s+/g, " ").trim().slice(0, 600);
  if (!text) return json({ error: "empty" }, 400);
  // 1순위: Workers AI 여성 음성(ko=MeloTTS kr · en=Aura-2 asteria) — 600자까지 한 번에 처리
  let aiFailReason = "";
  try {
    const [engine, out] = await aiFemaleTTS(env, text, tl);
    return new Response(out, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400", "x-tts-engine": engine, ...CORS }
    });
  } catch (e) {
    aiFailReason = String(e && e.message || e).slice(0, 120);
    console.warn("[tts-free] ai tts failed, fallback google:", aiFailReason);
  }
  const chunks = [];
  let rest = text;
  while (rest.length) {
    if (rest.length <= 180) {
      chunks.push(rest);
      break;
    }
    let cut = rest.slice(0, 180);
    const b = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("。"), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
    if (b > 60) cut = rest.slice(0, b + 1);
    chunks.push(cut.trim());
    rest = rest.slice(cut.length);
  }
  const parts = [];
  // src=gtx 디버그: translate.googleapis.com(client=gtx) 경유 시험용
  const useGtx = url.searchParams.get("src") === "gtx";
  // 🇰🇷 카페24 KR-IP 릴레이: CF 데이터센터 IP로 받은 Google TTS(ko·zh)는 깨진 웅얼거림이라
  // (26-07-18 Whisper 전사로 확인) 한국 IP인 카페24 서버의 mango-tts-relay.php 를 경유한다.
  // 시크릿 TTS_RELAY_URL/TTS_RELAY_KEY 가 없으면 기존 직접 호출로 폴백(구 동작 유지).
  const relayBase = env.TTS_RELAY_URL || "";
  const relayKey = env.TTS_RELAY_KEY || "";
  let engine = "google";
  for (const c of chunks) {
    if (!c) continue;
    let buf = null;
    if (relayBase && relayKey) {
      try {
        const r = await fetch(`${relayBase}?tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(c)}`, {
          headers: { "X-TTS-KEY": relayKey }
        });
        if (r.ok) {
          const b = new Uint8Array(await r.arrayBuffer());
          if (b.byteLength > 200) { buf = b; engine = "google-kr-relay"; }
        }
      } catch (_) {}
    }
    if (!buf) {
      const gurl = useGtx
        ? `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${tl}&q=${encodeURIComponent(c)}`
        : `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(c)}`;
      const g = await fetch(gurl, {
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://translate.google.com/" }
      });
      if (g.ok) {
        const b = new Uint8Array(await g.arrayBuffer());
        if (b.byteLength > 200) buf = b;
      }
    }
    if (buf) parts.push(buf);
  }
  if (!parts.length) return json({ error: "tts_failed" }, 502);
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return new Response(out, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400", "x-tts-engine": engine, "x-tts-ai-fail": encodeURIComponent(aiFailReason), ...CORS }
  });
}
__name(handleTTSFree, "handleTTSFree");
async function handleSTT(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "POST \uBA54\uC11C\uB4DC\uB9CC \uD5C8\uC6A9\uB429\uB2C8\uB2E4." }, 405);
  if (!env.AI) return json({ error: "no_ai_binding" }, 503);
  let bytes;
  try {
    const buf = await request.arrayBuffer();
    bytes = new Uint8Array(buf);
  } catch (e) {
    return json({ error: "bad_audio", detail: String(e) }, 400);
  }
  if (!bytes || !bytes.length) return json({ error: "empty_audio" }, 400);
  const sttLang = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "ko";
  try {
    let bin = "";
    const CH = 32768;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    const b64 = btoa(bin);
    const r = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
      audio: b64,
      language: sttLang,
      task: "transcribe"
    });
    const text = (r && (r.text || r.transcription) || "").trim();
    return json({ text });
  } catch (e1) {
    try {
      const r = await env.AI.run("@cf/openai/whisper", { audio: [...bytes] });
      const text = (r && r.text || "").trim();
      return json({ text });
    } catch (e2) {
      return json({ error: "stt_failed", detail: String(e2) }, 502);
    }
  }
}
__name(handleSTT, "handleSTT");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") return handleChat(request, env);
    if (url.pathname === "/api/tts") return handleTTS(request, env);
    if (url.pathname === "/api/tts-free") return handleTTSFree(request, env);
    if (url.pathname === "/api/stt") return handleSTT(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  }
};
export {
  index_default as default,
  detectGo,
  enrollAffirm,
  enrollCancel,
  enrollIntent,
  enrollMerge,
  enrollParseFields,
  enrollRespond,
  detectMenu,
  extractGo,
  extractStudentName,
  hasKorean,
  isPointsQuestion,
  isRefundQuestion,
  stripLeakedCodes
};

