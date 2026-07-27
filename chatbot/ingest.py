import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from pinecone import Pinecone, ServerlessSpec
from langchain_pinecone import PineconeVectorStore

from app import HFEmbeddings, require_env

load_dotenv()

index_name = os.getenv("PINECONE_INDEX", "asr-global-solutions")
namespace = os.getenv("PINECONE_NAMESPACE", "website")
embedding_model = os.getenv("HF_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
embeddings = HFEmbeddings(require_env("HF_TOKEN"), embedding_model)
pc = Pinecone(api_key=require_env("PINECONE_API_KEY"))

if not pc.has_index(index_name):
    dimension = len(embeddings.embed_query("dimension check"))
    pc.create_index(
        name=index_name,
        dimension=dimension,
        metric="cosine",
        spec=ServerlessSpec(cloud=os.getenv("PINECONE_CLOUD", "aws"), region=os.getenv("PINECONE_REGION", "us-east-1")),
    )

content = Path(__file__).with_name("knowledge.md").read_text(encoding="utf-8")
sections = MarkdownHeaderTextSplitter(headers_to_split_on=[("#", "topic"), ("##", "section")]).split_text(content)
documents = RecursiveCharacterTextSplitter(chunk_size=700, chunk_overlap=100).split_documents(sections)
PineconeVectorStore.from_documents(
    documents,
    embedding=embeddings,
    index_name=index_name,
    namespace=namespace,
    pinecone_api_key=require_env("PINECONE_API_KEY"),
)
print(f"Indexed {len(documents)} ASR knowledge chunks into {index_name}/{namespace}.")
