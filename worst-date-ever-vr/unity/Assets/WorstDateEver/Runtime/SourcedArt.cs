using System;
using System.Linq;
using UnityEngine;

namespace WorstDateEver
{
    /// <summary>Imported CC0 models used by the date venues.</summary>
    public sealed class SourcedArt : ScriptableObject
    {
        public string[] Ids = Array.Empty<string>();
        public GameObject[] Models = Array.Empty<GameObject>();

        public GameObject Get(string id)
        {
            if (string.IsNullOrEmpty(id) || Ids == null || Models == null) return null;
            for (var i = 0; i < Ids.Length && i < Models.Length; i++)
                if (Ids[i] == id) return Models[i];
            return null;
        }
    }
}
