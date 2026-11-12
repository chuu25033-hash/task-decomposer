// LocalStorage の読み書き（容量オーバー・プライベートモード・保存のブロックなどで例外が出ても画面を落とさない）

export const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// 書き込めたら true
export const writeStorage = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeStorage = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // 消せなくても動作に支障はない
  }
};
