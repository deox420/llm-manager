from app.services.vault_sync import authed_url, chunk_markdown, parse_agent_note


def test_authed_url_injects_token():
    url = authed_url("https://github.com/user/vault.git", "tok123")
    assert url == "https://x-access-token:tok123@github.com/user/vault.git"


def test_authed_url_without_token_unchanged():
    assert authed_url("https://github.com/u/v.git", None) == "https://github.com/u/v.git"
    assert authed_url("git@github.com:u/v.git", "tok") == "git@github.com:u/v.git"


def test_chunk_markdown_splits_by_headings():
    text = "# Uno\ncontenido uno\n\n## Dos\ncontenido dos\n"
    chunks = chunk_markdown(text)
    assert len(chunks) == 2
    assert chunks[0].startswith("# Uno")
    assert chunks[1].startswith("## Dos")


def test_chunk_markdown_respects_max_chars():
    text = "# Grande\n" + "\n\n".join(["párrafo " + "x" * 100] * 30)
    chunks = chunk_markdown(text, max_chars=500)
    assert len(chunks) > 1
    assert all(len(c) <= 600 for c in chunks)


def test_parse_agent_note_full():
    fm = {
        "type": "agent",
        "name": "investigador",
        "model": "claude-fable-5",
        "fallback_models": ["gpt-5"],
        "temperature": 0.4,
        "tools": ["vault_search"],
        "rag_folders": ["Proyectos"],
        "description": "Agente de investigación",
    }
    agent = parse_agent_note(fm, "Eres un investigador.", "Agents/investigador.md")
    assert agent == {
        "name": "investigador",
        "description": "Agente de investigación",
        "model": "claude-fable-5",
        "fallback_models": ["gpt-5"],
        "system_prompt": "Eres un investigador.",
        "temperature": 0.4,
        "tools": ["vault_search"],
        "rag_folders": ["Proyectos"],
        "vault_path": "Agents/investigador.md",
    }


def test_parse_agent_note_defaults_name_from_path():
    agent = parse_agent_note({"type": "agent", "model": "m"}, "prompt", "Agents/mi agente.md")
    assert agent["name"] == "mi agente"
    assert agent["temperature"] == 0.7


def test_parse_agent_note_ignores_normal_notes():
    assert parse_agent_note({"title": "Nota normal"}, "contenido", "nota.md") is None
