let AddChatButton = ({
  color = 'blue',
  textColor = 'white',
  onClick = () => {},
}) => {
  return (
    <div
      class={`flex justify-center items-center cursor-pointer bg-${color}-600 text-${textColor} rounded-full p-3`}
      onClick={() => onClick()}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
        />
      </svg>
    </div>
  );
};

export default AddChatButton;
