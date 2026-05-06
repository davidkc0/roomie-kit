export const generateRandomHexColor = (): string => {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
};

export const getRandomExpression = (): string => {
  const expressions = ['happy', 'lol'];
  return expressions[Math.floor(Math.random() * expressions.length)];
};

export const setStoreValue = (key: string, value: string): void => {
  window.localStorage.setItem(key, value);
};

export const getStoreValue = (key: string): string | null => {
  return window.localStorage.getItem(key);
};

// Add hashCode method to String prototype for deterministic UID generation
declare global {
  interface String {
    hashCode(): number;
  }
}

String.prototype.hashCode = function() {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};
