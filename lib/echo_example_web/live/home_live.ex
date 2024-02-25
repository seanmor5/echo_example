defmodule EchoExampleWeb.HomeLive do
  use EchoExampleWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    socket =
      if connected?(socket) do
        assign(socket, conversing: false)
      else
        assign(socket, state: :loading)
      end

    {:ok, socket}
  end

  @impl true
  def render(%{state: :loading} = assigns) do
    ~H"""
    Loading
    """
  end

  def render(assigns) do
    ~H"""
    <div class="flex flex-col items-center justify-center antialiased">
      <div class="py-16 px-32">
        <h2 class="text-4xl text-center">Echo Example</h2>
      </div>

      <div class="flex flex-col items-center w-1/2">
        <div class="mb-6 text-gray-600 text-lg">
          <h2>Press the button to begin your "phone call."</h2>
        </div>

        <button
          type="button"
          id="conversation"
          phx-hook="Conversation"
          data-endianness={System.endianness()}
          class="p-5 text-white bg-blue-700 rounded-full text-sm hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 active:bg-red-400 group"
        >
          <.play_icon :if={not @conversing} class="w-8 h-8 group-active:animate-pulse" />
          <.pause_icon :if={@conversing} class="w-8 h-8 group-active:animate-pulse" />
        </button>
      </div>
    </div>
    """
  end

  defp play_icon(assigns) do
    ~H"""
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="currentColor"
      class={@class}
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
      />
    </svg>
    """
  end

  defp pause_icon(assigns) do
    ~H"""
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="currentColor"
      class={@class}
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
    </svg>
    """
  end

  @impl true
  def handle_event("toggle_conversation", _params, socket) do
    socket =
      if socket.assigns.conversing do
        stop_conversation(socket)
      else
        start_conversation(socket)
      end

    {:noreply, socket}
  end

  def handle_event("noop", %{}, socket) do
    {:noreply, socket}
  end

  ## Helpers

  defp start_conversation(socket) do
    assign(socket, conversing: true)
  end

  defp stop_conversation(socket) do
    assign(socket, conversing: false)
  end
end