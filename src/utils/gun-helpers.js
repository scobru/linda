export const wrapTimestamp = (timestamp) => {
  if (typeof timestamp === 'number') {
    return { value: timestamp };
  }
  return timestamp;
};

const handleData = (data) => {
  if (data && data.timestamp) {
    data.timestamp = wrapTimestamp(data.timestamp);
  }
  return data;
}; 