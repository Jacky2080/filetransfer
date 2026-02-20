import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,

  {
    files: ["**/*.js"],
    ignores: ["node_modules/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      // ========== 变量声明和赋值相关 ==========

      // 禁止给 const 重新赋值
      "no-const-assign": "error",

      // 禁止重复声明
      "no-redeclare": "error",

      // 禁止删除变量
      "no-delete-var": "error",

      // 禁止标签与变量同名
      "no-label-var": "error",

      // 禁止将标识符定义为受限名称
      "no-shadow-restricted-names": "error",

      // 禁止使用未声明的变量
      "no-undef": "error",

      // 禁止初始化变量为 undefined
      "no-undef-init": "error",

      // 强制使用 const（如果可能）
      "prefer-const": [
        "error",
        {
          destructuring: "all",
          ignoreReadBeforeAssign: false,
        },
      ],

      // 禁止使用 var
      "no-var": "error",

      // ========== 变量使用相关 ==========

      // 未使用的变量报错（你的核心需求）
      "no-unused-vars": [
        "warn",
        {
          vars: "all", // 检查所有变量
          args: "all", // 检查所有参数
          argsIgnorePattern: "^[_a-z]", // 忽略 _ 开头的参数
          varsIgnorePattern: "^_", // 忽略 _ 开头的变量
          caughtErrors: "all", // 检查 catch 参数
          caughtErrorsIgnorePattern: "^_", // 忽略 _ 开头的错误参数
          destructuredArrayIgnorePattern: "^_", // 忽略解构数组中的 _
          ignoreRestSiblings: false, // 不忽略 rest 操作符的兄弟
        },
      ],

      // 禁止在定义之前使用变量
      "no-use-before-define": [
        "error",
        {
          functions: false, // 允许函数提升
          classes: true, // 类必须先定义
          variables: true, // 变量必须先定义
        },
      ],

      // ========== 代码风格基础 ==========
      "indent": ["warn", 2],
      // 'quotes': ['error', 'single'],
      // semi: ["error", "always"],
      // eqeqeq: ["error", "always"],
    },
  },
];
