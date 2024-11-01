import { Show, For } from 'solid-js';
import { useChatsList } from '../../hooks/chatsList';

function ChatsTabPage() {
  const { chats, loading, error } = useChatsList();

  return (
    <div>
      <Show when={!loading()} fallback={<div>Caricamento chat...</div>}>
        <Show when={!error()} fallback={<div>Errore: {error()}</div>}>
          <For each={Object.entries(chats())}>
            {([key, chat]) => (
              <div class="chat-item">
                <span>{chat.pub}</span>
                {chat.latestMessage && (
                  <span>{chat.latestMessage}</span>
                )}
              </div>
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
}

export default ChatsTabPage; 